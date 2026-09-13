# Wire Protocol

## Signaling messages (JSON over WebSocket)

All messages are JSON envelopes: `{ "t": "<type>", ...fields }`.

### Client → Signaling

| `t` | Fields | When |
|---|---|---|
| `pair.new` | `{ agentPubKey }` | Host agent asks server for a fresh pairing code |
| `pair.claim` | `{ code }` | PWA client presents a pairing code to claim a host |
| `session.init` | `{ hostId, assertion }` (WebAuthn) | Paired client initiates a new session |
| `sdp.offer` | `{ peerId, sdp }` | WebRTC offer for the other peer |
| `sdp.answer` | `{ peerId, sdp }` | WebRTC answer for the other peer |
| `ice` | `{ peerId, candidate }` | Trickle ICE candidate for the other peer |
| `pong` | `{}` | Keepalive response |

### Signaling → Client

| `t` | Fields | Meaning |
|---|---|---|
| `pair.code` | `{ code, expiresAt }` | Reply to `pair.new` |
| `pair.claimed` | `{ peerId }` | Host is told a client has claimed the code |
| `session.ready` | `{ peerId }` | Other end is online; WebRTC negotiation can begin |
| `sdp.offer` / `sdp.answer` / `ice` | (relayed from peer) | Forwarded verbatim, encrypted-by-content by DTLS-SRTP |
| `error` | `{ code, message }` | Something went wrong |
| `ping` | `{}` | Keepalive |

Ping/pong every 25 s to survive load-balancer idle timeouts.

## Pairing code format

- Minted locally by the host agent (`agent/src-tauri/src/pairing.rs`). The
  signaling service never generates or validates a code — it only uses it as a
  Durable Object room key.
- Length is user-configurable: 6–128 characters, default 16. The floor matches
  the original fixed length; the ceiling matches the Worker's room-key check
  (`roomKey.length > 128` → 400).
- Alphabet `23456789abcdefghjkmnpqrstuvwxyz` (31 chars, excludes 0/1/i/l/o for
  legibility), so 16 characters is ~79 bits.
- A fresh code is minted per pairing attempt and dropped when the pair
  connection closes.
- The code *is* the room key: two peers may join `/ws/{code}`, and a third is
  refused because the room caps at two connections.

### Properties previously documented here

This section used to state the following as guarantees. They have been **left in
place rather than deleted**, but no implementation of them was found in this
repository. They may describe behaviour provided by the underlying platforms
(Cloudflare's edge / Durable Objects, or the browser), or they may be
aspirational — treat them as unverified until someone traces them to a concrete
mechanism.

| Claim | What's actually in the code |
|---|---|
| "~30 bits of entropy — enough to resist online brute force (server rate-limits to 5 attempts/min per IP)" | No rate-limiting logic exists in `signaling/src/index.ts`. The Worker never reads the client IP; the Durable Object only relays bytes. |
| "Valid for 60 seconds after generation" | No TTL is set or enforced anywhere. The room lives as long as its peers stay connected. |
| "One-shot: consumed the moment a client claims it" | Nothing is consumed or invalidated. A third peer is refused only because the room caps at two connections — not because the code was retired. |

Because none of the above is enforced in code, the code's entropy is currently
the only thing standing between a room and an uninvited guest. Prefer longer
codes.

## WebRTC channel layout

| Track / Channel | Purpose | Priority |
|---|---|---|
| `video` (RTP) | Screen frames | high |
| `audio` (RTP, optional) | Host audio | medium |
| `input` (DataChannel, ordered+reliable) | Mouse/keyboard events | high |
| `control` (DataChannel, ordered+reliable) | Cursor style, monitor list, resize | medium |
| `clipboard` (DataChannel, ordered+reliable) | Clipboard sync (phase 4+) | low |
| `files` (DataChannel, ordered+reliable) | File transfer chunks (phase 4+) | low |

## Input event schema (DataChannel)

Compact binary or JSON — leaning JSON for MVP simplicity, switch to binary if bandwidth-bound.

```
{ "t": "m", "x": 512, "y": 384 }              // mouse move (screen coords)
{ "t": "mb", "b": 0, "d": true }              // mouse button (0=left,1=middle,2=right; d=down)
{ "t": "w", "dx": 0, "dy": -120 }             // wheel
{ "t": "k", "code": "KeyA", "d": true }       // key event; codes = KeyboardEvent.code strings
{ "t": "tap", "x": 512, "y": 384 }            // touch tap (mobile PWA)
```

Server sends back control frames on `control` channel:
```
{ "t": "cursor", "kind": "text" }             // cursor style change
{ "t": "monitors", "list": [{id, w, h}] }    // monitor enumeration
{ "t": "resize", "w": 1920, "h": 1080 }       // active monitor resolution
```
