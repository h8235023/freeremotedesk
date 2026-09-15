/**
 * English strings. This file is the source of truth for the key set —
 * `MessageKey` is derived from it, and `zh-CN.ts` is typed as a full
 * `Record<MessageKey, string>` so a missing translation fails the typecheck.
 *
 * Values may embed `**bold**` and `` `code` `` markers, rendered by `rich.tsx`.
 */

export const en = {
  // ---------- Landing (marketing page at /) ----------
  "landing.hero.line1": "Your home dev machine,",
  "landing.hero.line2": "from any browser.",
  "landing.hero.free": "Free forever.",
  "landing.subhead":
    "A remote-desktop PWA + host agent that runs entirely on your own free-tier Cloudflare and Vercel accounts. No servers we control. No monthly bills. No accounts to create.",
  "landing.cta.open": "Open the client →",
  "landing.cta.deploy": "Deploy your own on GitHub",

  "landing.why.title": "Why it's different",
  "landing.f1.title": "Nobody in the middle",
  "landing.f1.body":
    "Video + input traffic goes P2P over WebRTC. The signaling Worker on your own Cloudflare account sees only encrypted handshake bytes.",
  "landing.f2.title": "$0 forever",
  "landing.f2.body":
    "Cloudflare Workers + Vercel free tiers cover personal remote-desktop use easily. No trial period, no upgrade nag, no credit card.",
  "landing.f3.title": "PWA, not an app-store install",
  "landing.f3.body":
    "Open in any browser, add to home screen, launch like a native app. iOS, Android, laptops — same client everywhere.",
  "landing.f4.title": "You own the whole stack",
  "landing.f4.body":
    "Your Cloudflare account, your Vercel deploy, your installer. Fork the repo, change anything, deploy your version.",
  "landing.f5.title": "One-tap reconnect",
  "landing.f5.body":
    "Pair once with a code, then your paired devices show up in a list. Tap to reconnect — biometric-style trust, no code re-entry.",
  "landing.f6.title": "Built for vibe coders",
  "landing.f6.body":
    "The setup docs are written for AI agents. Point Claude or Cursor at the repo; it deploys the whole thing while you go get coffee.",

  "landing.setup.title": "Setup in 3 clicks",
  "landing.step1":
    "**Hand the repo to your AI** (Claude, Cursor, Aider, Codex — any AI coding tool with a terminal). Tell it: *\"Set up FreeRemoteDesk. Read AGENTS.md and follow it.\"*",
  "landing.step2":
    "Complete **three CLI logins** when it prompts you — GitHub, Cloudflare, Vercel. One browser click each.",
  "landing.step3":
    "Run the **installer** your AI downloads for your OS. Paste the two URLs it gives you into the wizard.",
  "landing.stepsFoot.prefix": "Prefer clicking buttons? The ",
  "landing.stepsFoot.link": "GitHub README",
  "landing.stepsFoot.after":
    " has \"Deploy to Cloudflare\" and \"Deploy to Vercel\" one-click buttons too.",

  "landing.how.title": "How it works",
  "landing.how.p1":
    "The **host agent** is a small Tauri app that runs on the machine you want to reach. It uses your browser engine's built-in `getDisplayMedia` to capture the screen and standard **WebRTC** to stream it — the same tech Zoom and Google Meet use — with all traffic encrypted end-to-end via DTLS-SRTP.",
  "landing.how.p2":
    "The **PWA client** loads in any modern browser, installs to your home screen on mobile, and connects directly to the host — the signaling Worker only sees a handful of small handshake messages, never your video or input.",
  "landing.how.p3":
    "The **signaling Worker** on your Cloudflare account routes the handshake using a single Durable Object per session. Free tier covers ~10,000 sessions/day; you'll never approach the limit for personal use.",

  "landing.trust.title": "Trusted-device reconnect",
  "landing.trust.body":
    "Pair your phone or laptop once with a one-off code. From then on it shows up in your paired-hosts list — one tap to reconnect, no code needed. Credentials never leave the two devices; the signaling server can't impersonate you.",

  "landing.footer.note": "Open source (Apache-2.0 pending) — ",
  "landing.footer.client": "Open client",
  "landing.footer.download": "Download agent",
  "landing.footer.agents": "For AI agents",

  // ---------- Connect view ----------
  "connect.subtitle.saved": "Tap a saved host to reconnect, or add a new one.",
  "connect.subtitle.empty": "Enter the pairing code shown on your host.",
  "connect.pairNew": "Pair a new host",
  "connect.placeholder": "pairing code",
  "connect.action.connect": "Connect",
  "connect.action.connecting": "Connecting…",
  "connect.changeServer": "Change signaling server",
  "connect.status.connectingTo": "Connecting to {name}…",
  "connect.status.authFailed": "Auth failed for {name}",
  "connect.status.failed": "Connection failed",

  // ---------- Saved-hosts list ----------
  "savedHosts.title": "Your paired hosts",
  "savedHosts.reconnectTo": "Reconnect to {name}",
  "savedHosts.lastUsed": "last used {age}",
  "savedHosts.notConnected": "not yet connected",
  "savedHosts.forgetConfirm":
    "Forget \"{name}\"? You'll need to pair again with a code.",
  "savedHosts.forgetTitle": "Forget this host",
  "savedHosts.age.now": "just now",
  "savedHosts.age.minutes": "{n}m ago",
  "savedHosts.age.hours": "{n}h ago",
  "savedHosts.age.days": "{n}d ago",

  // ---------- Post-pair save prompt ----------
  "save.title": "Save this host?",
  "save.help":
    "Next time you open the PWA, this host shows up in a list — one tap to reconnect, no code needed.",
  "save.wait.connecting":
    "Connecting to the host… (ICE: {state}). Saving unlocks once the control channel is open.",
  "save.wait.failed":
    "Could not reach the host (ICE: {state}). If you are on a phone, this is usually NAT traversal failing — try a different network, or turn off any VPN / Zero Trust client.",
  "save.deviceName": "Device name (for your reference)",
  "save.deviceNamePlaceholder": "e.g. My iPhone",
  "save.action.save": "Save",
  "save.action.notNow": "Not now",
  "save.saving": "Saving…",
  "save.success.title": "✅ Saved",
  "save.success.help":
    "**{name}** is now in your paired-hosts list. You can reconnect anytime.",
  "save.success.recommend":
    "**Optional but recommended:** bookmark this URL. If your browser ever clears its storage, opening the bookmark restores access — no re-pairing needed.",
  "save.action.copy": "Copy",
  "save.action.copied": "Copied ✓",
  "save.warning": "Anyone with this URL gets access. Keep it private.",
  "save.action.done": "Done",
  "save.error.title": "Something went wrong",
  "save.action.tryAgain": "Try again",
  "save.action.close": "Close",
  "save.error.controlChannel":
    "Control channel not open yet — wait a moment and try again.",
  "save.error.timeout": "host did not respond within 5s",
  "save.error.rejected": "host rejected pair.save",

  // ---------- Signaling setup screen ----------
  "setup.subtitle": "First-time setup. Paste your signaling Worker URL.",
  "setup.placeholder": "https://freeremotedesk-signaling.you.workers.dev",
  "setup.action.testing": "Testing…",
  "setup.action.continue": "Continue",
  "setup.footer":
    "Don't have one yet? Click \"Deploy to Cloudflare\" on the FreeRemoteDesk GitHub repo to spin up your own signaling Worker in a couple of clicks.",
  "setup.error.healthCheck": "Health check failed",
  "setup.error.serverReturned": "server returned {status}",
  "setup.error.notSignaling": "not a FreeRemoteDesk signaling server",

  // ---------- Session toolbar ----------
  "toolbar.showKeyboard": "Show keyboard",
  "toolbar.endSession": "End session",

  // ---------- File transfer ----------
  "file.button": "Files",
  "file.title": "File transfer",
  "file.action.send": "Send a file to the host",
  "file.action.close": "Close",
  "file.action.fullscreen": "Fullscreen",
  "file.waiting": "Preparing the file channel…",
  "file.unsupported":
    "The host is running a build without file transfer, so this is unavailable.",
  "file.empty": "No transfers yet.",
  // The row already shows the filename, so these omit it.
  "file.status.sending": "Sending — {done} / {total}",
  "file.status.receiving": "Receiving — {done} / {total}",
  "file.status.downloaded": "Downloaded",
  "file.status.sent": "Sent",
  "file.status.failed": "Failed — {reason}",
  "file.hint.slow":
    "Transfers share the connection with the screen; video may stutter while one runs.",
  "file.reason.too_large": "the file is larger than the host's limit",
  "file.reason.busy": "another transfer is already running",
  "file.reason.io": "the host could not write the file",
  "file.reason.cancelled": "the transfer was cancelled",
  "file.reason.interrupted": "the connection dropped",
  "file.reason.incomplete": "fewer bytes arrived than expected",
  "file.reason.unsupported": "the host doesn't support file transfer",
  "file.reason.protocol": "the file channel isn't ready",

  // ---------- Generated device names ----------
  "device.android": "Android device",
  "device.windows": "Windows PC",
  "device.linux": "Linux device",
  "device.browser": "Browser",

  // ---------- Language switch ----------
  "lang.label": "Language",
} as const;

export type MessageKey = keyof typeof en;
