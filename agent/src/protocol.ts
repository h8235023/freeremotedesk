/**
 * Signaling protocol messages. Must stay in sync with pwa/src/webrtc/protocol.ts.
 */

/**
 * Which RTCPeerConnection a negotiation message belongs to.
 *
 * File transfer runs on its own peer connection so a large transfer can't starve
 * the screen stream for bandwidth — under `max-bundle` the media and input
 * channels otherwise share one transport and one congestion controller. Both
 * connections share the single signaling WebSocket, so every `sdp`/`ice` message
 * has to say which one it is for. Absent means `"media"`, which is what a peer
 * running an older build sends; the relay forwards verbatim and never looks.
 */
export type PeerKind = "media" | "files";

export type SignalMessage =
  | { t: "welcome"; peerId: "host" | "client"; others: string[] }
  | { t: "ready"; peerId: "host" | "client" }
  | { t: "peer-gone"; peerId: string }
  | { t: "sdp"; pc?: PeerKind; kind: "offer" | "answer"; sdp: string }
  | { t: "ice"; pc?: PeerKind; candidate: RTCIceCandidateInit | null }
  | { t: "auth"; clientId: string; secret: string }
  | { t: "auth.ok" }
  | { t: "auth.fail"; reason?: string };

export type ControlMessage =
  | { t: "pair.save"; clientId: string; deviceName: string; secret: string }
  | { t: "pair.save.ok"; hostId: string; hostName: string }
  | { t: "pair.save.fail"; reason?: string };

export function encode(msg: SignalMessage): string {
  return JSON.stringify(msg);
}

export function decode(raw: string): SignalMessage | null {
  try {
    const parsed = JSON.parse(raw) as SignalMessage;
    if (typeof parsed !== "object" || parsed === null || !("t" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeControl(msg: ControlMessage): string {
  return JSON.stringify(msg);
}

export function decodeControl(raw: string): ControlMessage | null {
  try {
    const parsed = JSON.parse(raw) as ControlMessage;
    if (typeof parsed !== "object" || parsed === null || !("t" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Messages on the "files" DataChannel.
 *
 * `reason` is always a short code — `too_large`, `busy`, `io`, `cancelled`,
 * `interrupted`, `unsupported`, `protocol` — never prose. These cross Rust →
 * agent TS → PWA and get translated at the far end. `detail` carries raw
 * diagnostic text and is deliberately left untranslated.
 */
export type FileMessage =
  | { t: "file.offer"; name: string; size: number; mime?: string }
  /** `name` is the sanitized, de-collided name the file will actually have. */
  | { t: "file.accept"; name: string }
  | { t: "file.reject"; reason: string; detail?: string }
  | { t: "file.eof" }
  | { t: "file.done"; name: string; path: string; bytes: number; sha256: string }
  | { t: "file.fail"; reason: string; detail?: string }
  | { t: "file.cancel" };

export function encodeFile(msg: FileMessage): string {
  return JSON.stringify(msg);
}

export function decodeFile(raw: string): FileMessage | null {
  try {
    const parsed = JSON.parse(raw) as FileMessage;
    if (typeof parsed !== "object" || parsed === null || !("t" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type InputEvent =
  | { t: "m"; x: number; y: number }
  | { t: "mr"; dx: number; dy: number }
  | { t: "mb"; b: 0 | 1 | 2; d: boolean }
  | { t: "w"; dx: number; dy: number }
  | { t: "k"; code: string; d: boolean; mods: number }
  | { t: "tap"; x: number; y: number };
