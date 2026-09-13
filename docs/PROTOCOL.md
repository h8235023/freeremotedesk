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
- Length is user-configurable: 8–128 characters, default 16. The floor keeps a
  code out of hand-brute-force range; the ceiling matches the Worker's room-key
  check (`roomKey.length > 128` → 400).
- Alphabet `23456789abcdefghjkmnpqrstuvwxyz` (31 chars, excludes 0/1/i/l/o for
  legibility), so 16 characters is ~79 bits.
- A fresh code is minted per pairing attempt and dropped when the pair
  connection closes.
- The code *is* the room: whoever reaches `/ws/{code}` second is joined to the
  session. There is currently **no attempt rate-limiting and no expiry** — the
  entropy of the code is the only thing protecting the room, so prefer longer
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
