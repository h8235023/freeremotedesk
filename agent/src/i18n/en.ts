/**
 * English strings (agent UI). Source of truth for the key set — `zh-CN.ts` is
 * typed as a full `Record<MessageKey, string>`, so a missing translation fails
 * the typecheck instead of silently falling back.
 *
 * Values may embed `**bold**`, `*italic*` and `` `code` `` markers (see
 * `rich.tsx`).
 */

export const en = {
  // ---------- Main window ----------
  "agent.hostName": "My computer",
  "agent.loading": "Loading…",
  "agent.reload": "Reload",
  "agent.error.title": "Something went wrong",

  "agent.idle.start": "Start listening",
  "agent.idle.hint":
    "You'll pick which screen to share. Then trusted devices can reconnect anytime — you'll get a prompt each time.",

  "agent.status.session": "Session · {state}",
  "agent.status.listening.one": "Listening · {n} trusted device",
  "agent.status.listening.many": "Listening · {n} trusted devices",

  "agent.trusted.title": "Trusted devices",
  "agent.action.revoke": "Revoke",
  "agent.action.addDevice": "Add a new device",
  "agent.action.stopListening": "Stop listening",
  "agent.action.settings": "Settings",

  // ---------- Incoming reconnect prompt ----------
  "agent.incoming.title": "Incoming connection",
  "agent.incoming.body": "**{name}** wants to reconnect.",
  "agent.incoming.hint": "You'll be asked to pick a screen or window to share.",
  "agent.action.accept": "Accept",
  "agent.action.decline": "Decline",

  // ---------- OS notification ----------
  "agent.notification.body": "{name} is trying to reconnect — click to accept.",
  "agent.trustedDevice": "A trusted device",

  // ---------- Setup wizard / settings ----------
  "wizard.title": "Setup",
  "wizard.help":
    "FreeRemoteDesk runs on YOUR own free-tier Cloudflare and Vercel accounts. Deploy your instance from the GitHub repo, then paste the two URLs here.",
  "wizard.signaling.label": "Signaling URL",
  "wizard.signaling.placeholder":
    "https://freeremotedesk-signaling.your-name.workers.dev",
  "wizard.signaling.hint":
    "Your Cloudflare Workers URL. Get it from the Workers dashboard after deploying the signaling package.",
  "wizard.pwa.label": "PWA URL",
  "wizard.pwa.optional": "(optional)",
  "wizard.pwa.placeholder": "https://myremotedesk.vercel.app",
  "wizard.pwa.hint": "Your Vercel deployment. Shown as a hint on the pairing screen.",
  "wizard.codeLen.label": "Pairing code length",
  "wizard.codeLen.hint":
    "Characters per generated code ({min}–{max}). Longer codes are harder to guess; you only type one per device. A new code is generated for every pairing.",
  "wizard.autostart": "Start FreeRemoteDesk when I sign in",
  "wizard.action.save": "Save and continue",
  "wizard.action.saving": "Saving…",
  "wizard.status.testing": "Testing signaling URL…",
  "wizard.footer":
    "Config is stored locally in your OS app-data directory. You can change these anytime from the agent's Settings menu.",
  "wizard.error.healthFailed": "Health check failed: {reason}",
  "wizard.error.saveFailed": "Save failed: {reason}",
  "wizard.error.notSignaling":
    "not a FreeRemoteDesk signaling server (got: {body})",

  // ---------- File transfer ----------
  "file.action.send": "Send a file",
  "file.status.offered": "The client sent **{name}** ({size})…",
  "file.status.sending": "Sending **{name}** — {done} / {total}",
  "file.status.receiving": "Receiving **{name}** — {done} / {total}",
  "file.status.saved": "Saved **{name}** to {folder}",
  "file.status.sent": "Sent **{name}**",
  "file.status.failed": "Transfer failed — {reason}",
  "file.reason.too_large": "the file is larger than this machine's limit",
  "file.reason.busy": "another transfer is already running",
  "file.reason.io": "the file could not be written",
  "file.reason.cancelled": "the other side cancelled",
  "file.reason.interrupted": "the connection dropped",
  "file.reason.incomplete": "fewer bytes arrived than expected",
  "file.reason.unsupported": "the other side doesn't support file transfer",
  "file.reason.protocol": "the file channel isn't ready",
  "file.error.noChannel": "The file channel isn't ready yet.",
  "file.notification.saved": "{name} received",
  "file.notification.sent": "{name} sent",

  // ---------- Language switch ----------
  "lang.label": "Language",
} as const;

export type MessageKey = keyof typeof en;
