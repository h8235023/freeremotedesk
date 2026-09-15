/**
 * FreeRemoteDesk signaling service.
 *
 * Cloudflare Worker that routes pairing codes + relays WebRTC signaling
 * (SDP offers/answers, ICE candidates) between a host agent and a PWA client.
 *
 * The Durable Object is the stateful piece — one instance per pairing/session
 * room, addressed by the pairing code. The Worker itself is stateless.
 *
 * Deployed by each end user to their own Cloudflare account (BYO infra).
 */

export interface Env {
  SESSION: DurableObjectNamespace;
  /** Optional comma-separated origin allow-list. Empty = any origin. */
  ALLOWED_ORIGINS?: string;
  /** WebSocket upgrades allowed per IP per minute. Default 30. */
  MAX_WS_PER_MIN_PER_IP?: string;
  /** WebSocket upgrades allowed across all IPs per minute. Default 600. */
  MAX_WS_PER_MIN?: string;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), req, env);
    }

    if (url.pathname === "/health") {
      return cors(json({ ok: true, service: "freeremotedesk-signaling" }), req, env);
    }

    // WebSocket entry: /ws/{roomKey}. RoomKey is the pairing code (during pair)
    // or the persistent host-id (during a session). We don't distinguish here;
    // the DO is just a two-peer relay identified by that string.
    if (url.pathname.startsWith("/ws/")) {
      const roomKey = url.pathname.slice("/ws/".length);
      if (!roomKey || roomKey.length > 128) return json({ error: "bad room" }, 400);

      // Guessing a pairing code means opening a WebSocket per attempt, so this
      // is the one place a limiter has anything to bite on.
      const verdict = checkRateLimit(req, env);
      if (!verdict.ok) {
        return json({ error: "rate limited" }, 429, { "retry-after": String(verdict.retryAfter) });
      }

      const id = env.SESSION.idFromName(roomKey);
      const stub = env.SESSION.get(id);
      return stub.fetch(req);
    }

    return cors(json({ error: "not found" }, 404), req, env);
  },
};

// ---------- Rate limiting ----------

/**
 * Sliding-window counters, module-scoped so they survive between requests in one
 * isolate and reset when it recycles.
 *
 * This is deliberately **not** a Durable Object. A per-IP DO would let an
 * attacker with a large IP pool create unbounded DO instances on the account
 * paying the bill — turning a request-quota problem into a worse one — and it
 * would force every existing deployment to apply a second migration. For a
 * personal instance this is the right trade.
 *
 * The honest limitation: Cloudflare runs many isolates per colo and across
 * colos, so a distributed attacker's real budget is `limit × isolates`, and
 * counters evaporate on recycle. This is a best-effort abuse brake that bounds
 * how fast someone can burn the owner's free-tier quota. It is not a security
 * boundary, and at the default 16-character code the search space is far too
 * large for guessing to matter anyway.
 */
const WINDOW_MS = 60_000;

/** Cap on tracked keys, so the limiter can't itself be a memory-exhaustion vector. */
const MAX_TRACKED = 5_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function parseLimit(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bump(key: string, limit: number, now: number): boolean {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (buckets.size > MAX_TRACKED) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    // Still over budget after sweeping expired entries: drop oldest-inserted.
    // Map preserves insertion order, so this discards the coldest keys.
    while (buckets.size > MAX_TRACKED) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  return bucket.count <= limit;
}

function checkRateLimit(
  req: Request,
  env: Env,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfter: number } {
  const perIp = parseLimit(env.MAX_WS_PER_MIN_PER_IP, 30);
  const global = parseLimit(env.MAX_WS_PER_MIN, 600);

  // Cloudflare sets CF-Connecting-IP at the edge and strips anything a client
  // sends. It is absent under `wrangler dev`, hence the shared "local" bucket —
  // keeping the code path identical between dev and prod rather than skipping
  // the check, so CI exercises the real logic. (The smoke test opens 2 sockets
  // back-to-back; both limits are far above that.)
  const ip = req.headers.get("CF-Connecting-IP") ?? "local";

  if (!bump(`ip:${ip}`, perIp, now)) return { ok: false, retryAfter: WINDOW_MS / 1000 };
  if (!bump("global", global, now)) return { ok: false, retryAfter: WINDOW_MS / 1000 };
  return { ok: true };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

function cors(res: Response, req: Request, env: Env): Response {
  const origin = req.headers.get("Origin");
  const allowed = allowOrigin(origin, env);
  const h = new Headers(res.headers);
  if (allowed) h.set("access-control-allow-origin", allowed);
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  h.set("vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
}

function allowOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return "*";
  const list = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return origin; // no restriction — echo the origin
  return list.includes(origin) ? origin : null;
}

/**
 * SessionRoom: one Durable Object instance per pairing code / active host ID.
 *
 * Holds up to two WebSocket peers (host agent + client) and relays messages
 * between them. Content is opaque — the DO never inspects SDP or ICE.
 */
export class SessionRoom implements DurableObject {
  private state: DurableObjectState;
  private peers = new Map<string, WebSocket>();

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    if (this.peers.size >= 2) {
      server.close(1008, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const peerId = this.peers.size === 0 ? "host" : "client";
    server.accept();
    this.peers.set(peerId, server);

    server.addEventListener("message", (evt) => this.onMessage(peerId, evt));
    server.addEventListener("close", () => this.onClose(peerId));
    server.addEventListener("error", () => this.onClose(peerId));

    server.send(
      JSON.stringify({
        t: "welcome",
        peerId,
        others: Array.from(this.peers.keys()).filter((k) => k !== peerId),
      }),
    );

    if (this.peers.size === 2) {
      for (const [id, ws] of this.peers) {
        ws.send(JSON.stringify({ t: "ready", peerId: id === "host" ? "client" : "host" }));
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(fromPeerId: string, evt: MessageEvent) {
    // Relay to the other peer verbatim. All content is E2E encrypted at the
    // WebRTC layer; we're a dumb pipe.
    for (const [id, ws] of this.peers) {
      if (id === fromPeerId) continue;
      try {
        ws.send(typeof evt.data === "string" ? evt.data : new Uint8Array(evt.data as ArrayBuffer));
      } catch {
        this.onClose(id);
      }
    }
  }

  private onClose(peerId: string) {
    const ws = this.peers.get(peerId);
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    this.peers.delete(peerId);
    for (const [, other] of this.peers) {
      try {
        other.send(JSON.stringify({ t: "peer-gone", peerId }));
      } catch {
        /* ignore */
      }
    }
  }
}
