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

> **⚠️ Not found in the code — kept for reference.**
> None of the limits below are implemented in this repository. There is no
> `env.RATE_LIMITER` binding in `signaling/wrangler.toml` (which states
> "no rate limit binding required for MVP"), the Worker never reads the client
> IP, and no TTL or one-shot consumption of a pairing code exists anywhere — a
> room simply lives as long as its peers stay connected. The text is **left in
> place rather than deleted** because these may describe behaviour provided by
> the underlying platform (Cloudflare's edge / Durable Objects) rather than by
> this code. They may also be aspirational. Treat them as unverified until
> someone traces them to a concrete mechanism; see the fuller table in
> [`PROTOCOL.md`](PROTOCOL.md#properties-previously-documented-here).

- **Pairing code guesses**: 5 per IP per minute; global 1000 per minute (any IP)
- **Session inits**: 60 per credential per hour (prevents runaway loops)
- **WebSocket connections**: 20 concurrent per IP

*(Claimed to be)* enforced at the CF Worker layer via `env.RATE_LIMITER` binding (Cloudflare Rate Limiting API).

## Dependencies audited before Phase 4

- `webrtc-rs` (host agent WebRTC) — check for CVEs before shipping installers
- `@simplewebauthn/*` — signed by well-known author, active maintenance
- `scap` / `windows-capture` — screen capture crates; verify no telemetry
- Any Cloudflare Worker deps must be pinned

## AGPL / license implications

Since we're NOT forking RustDesk anymore, we're not bound by AGPL. Recommended: **Apache-2.0** for permissive reuse, or **MIT** if simpler is preferred. Decide before public release.
