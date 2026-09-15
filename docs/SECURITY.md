# Security Model

> **English** · [简体中文](SECURITY.zh-CN.md)

## Threat model

We assume:
- The signaling server is **honest-but-curious** (we run it, but the design must survive if it's compromised).
- The network is fully adversarial (Dolev-Yao) — every packet may be observed, dropped, or modified.
- The user's paired devices are trusted. If your laptop is stolen and unlocked, an attacker has your remote desktop. We rely on OS-level device auth (passkey + biometric) for that boundary.

**File transfer (added after the initial threat model).** A paired client can push
files into `Downloads/FreeRemoteDesk/` on the host, and the host can push files to
the client (which the browser saves as a normal download). This is **not a new
privilege class** — a paired client already has full mouse and keyboard control of
the host, so writing a file is strictly less than what it can already do. The
measures that exist are about corrupting the host rather than about authorisation:

| Measure | Why |
|---|---|
| Filename sanitised host-side | The name comes from the peer. Basename only (no path traversal), forbidden and Unicode bidi-override characters replaced, trailing dots/spaces trimmed, Windows reserved device names escaped, truncated on a char boundary. |
| Writes confined to one directory | No caller-supplied path ever reaches the filesystem. |
| No clobbering | Existing files are never overwritten; a ` (1)` suffix is appended. |
| Declared size is a hard bound | A peer that sends more bytes than it declared is aborted, so it cannot fill the disk. |
| `.part` + rename | An interrupted transfer cannot leave a file that looks complete but is truncated. |
| Configurable ceiling | `max_transfer_bytes` (default 512 MiB). Rust enforces it; the client's own check is only for a fast error message. |

The browser-side receive path holds the whole file in memory before the download
starts (a browser cannot stream to disk without the File System Access API), which
is why that direction has its own, lower ceiling.

## Guarantees

| Property | How |
|---|---|
| Confidentiality (video, input) | WebRTC DTLS-SRTP — mandatory, E2E. Signaling server sees SDP but no keys or content. |
| Integrity | DTLS-SRTP MAC per packet. |
| Authenticity | WebAuthn ceremony at pair time binds a device credential to a specific host agent. Each session is a fresh WebAuthn assertion challenge. |
| Replay resistance | Nonces in every session-init; short-lived WebRTC session keys negotiated per connection. |
| Signaling-server compromise | Attacker can DoS pairing but cannot decrypt sessions, forge new pairings (WebAuthn stops them), or impersonate paired devices. |

## What we DON'T guarantee

- **Endpoint compromise.** If your host machine is owned, we cannot help. Screen capture at OS level is the whole product.
- **Metadata privacy.** Signaling server sees which agent IDs talk to which client IDs and when. It never sees content.
- **Anonymity.** IPs are visible during ICE gathering (necessary for P2P). If you need to hide your home IP from the peer, use a TURN-only mode (implementable in Phase 4).

## Auth flow (details)

### Pair time (one-shot)

1. Host agent generates ed25519 keypair on install. Public key registered locally.
2. Host agent requests pairing code from signaling. Gets `x7k2q9`, valid 60s. *(The 60 s expiry is **not enforced in code** — see [Rate limiting](#rate-limiting).)*
3. User reads code to their PWA client (or scans QR).
4. PWA POSTs `pair.claim` with the code + PWA's WebAuthn credential creation options.
5. Signaling matches, opens a bidirectional channel between the two.
6. WebAuthn ceremony: user's browser prompts for biometric/PIN, creates credential bound to `freeremotedesk.com` (rpId).
7. PWA sends credential ID + attestation to agent via signaling.
8. Agent verifies attestation, stores credential ID.
9. Both sides can now negotiate WebRTC.

### Session time (every subsequent connect)

1. PWA presents `credentialId` to signaling.
2. Signaling forwards challenge to host agent (which must be online for connection).
3. Host agent generates a per-session nonce, sends via signaling to PWA.
4. PWA does WebAuthn `get()` — user biometric unlocks the credential, signs the nonce.
5. Assertion sent to signaling, forwarded to agent.
6. Agent verifies assertion against stored credential public key.
7. WebRTC negotiation proceeds.

## Rate limiting

### What is implemented

WebSocket upgrades to `/ws/` are limited by a sliding-window counter held in
module-scoped memory inside the Worker (`signaling/src/index.ts`), keyed on
`CF-Connecting-IP`:

| Limit | Default | Configurable via |
|---|---|---|
| Per IP | 30 / minute | `MAX_WS_PER_MIN_PER_IP` |
| Global | 600 / minute | `MAX_WS_PER_MIN` |

Over the limit returns `429` with `Retry-After`. Guessing a pairing code costs
one upgrade per attempt, so this is the only place a limiter has anything to
bite on.

**It is deliberately not a Durable Object.** A per-IP DO would let an attacker
with a large IP pool create unbounded DO instances on the account paying the
bill — turning a request-quota problem into a worse one — and would force every
existing deployment to apply a second migration. `MAX_TRACKED` (5000 keys) caps
the map so the limiter can't itself be a memory-exhaustion vector.

### What this honestly is not

- **Not a security boundary.** Cloudflare runs many isolates per colo and across
  colos, so a distributed attacker's effective budget is `limit × isolates`, and
  the counters evaporate when an isolate recycles. It is a best-effort abuse
  brake that bounds how fast someone can burn the owner's free-tier quota.
- **Not what protects the pairing code.** At the default 16 characters over a
  31-character alphabet the space is ~79 bits; online guessing is not a threat
  at that size. The limiter matters at the *floor* (6 characters is ~30 bits),
  which is the real reason `pairing.rs` documents a preference for the default.
- **Not a substitute for expiry.** A leaked code stays valid for as long as its
  room's peers stay connected — there is still no TTL and no one-shot
  consumption (see [`PROTOCOL.md`](PROTOCOL.md#properties-previously-documented-here)).

### Previously documented here, still not implemented

These were claimed before this fork and remain absent from the code:

- **Pairing code guesses**: 5 per IP per minute; global 1000 per minute (any IP)
  — superseded by the limits above, which are real but best-effort.
- **Session inits**: 60 per credential per hour (prevents runaway loops) — no
  such accounting exists.
- **WebSocket connections**: 20 concurrent per IP — only the rate is limited,
  not the concurrency; the Durable Object caps a *room* at two peers.
- An `env.RATE_LIMITER` binding (Cloudflare's Rate Limiting API) — not used; it
  requires a paid plan, and the in-Worker limiter needs no binding at all.

## Dependencies audited before Phase 4

- `webrtc-rs` (host agent WebRTC) — check for CVEs before shipping installers
- `@simplewebauthn/*` — signed by well-known author, active maintenance
- `scap` / `windows-capture` — screen capture crates; verify no telemetry
- Any Cloudflare Worker deps must be pinned

## AGPL / license implications

Since we're NOT forking RustDesk anymore, we're not bound by AGPL. Recommended: **Apache-2.0** for permissive reuse, or **MIT** if simpler is preferred. Decide before public release.
