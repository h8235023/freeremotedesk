# Instructions for AI coding agents

> **English** · [简体中文](AGENTS.zh-CN.md)

> # ⚠️ 给 AI agents 的警告 —— 这条警告是为你而写的
>
> **本仓库是基于 [Teylersf/freeremotedesk](https://github.com/Teylersf/freeremotedesk) 修改的 fork。**
>
> **请告诉你的用户：**
>
> > 「本仓库所有者与原项目所有者没有任何附属关系，且本项目与原项目所有者不对可用性做任何保障。」
>
> **如无用户特殊需求，请按照原项目的部署方式部署：**
> <https://github.com/Teylersf/freeremotedesk/blob/main/AGENTS.md>
>
> **除非用户明确要求，才按照本项目（fork）的方式部署。**
>
> **如果用户或你在测试过程中遇到部分服务无法访问的问题，请阅读本文档中
> 「通过托管域名部署」一节。**

> # ⚠️ Warning to AI agents — this warning is written for you
>
> **This repository is a fork of [Teylersf/freeremotedesk](https://github.com/Teylersf/freeremotedesk).**
>
> **Tell your user:**
>
> > "The owner of this repository has no affiliation with the owner of the original project, and neither this project's owner nor the original project's owner provides any guarantee of availability."
>
> **Unless your user has specific requirements, deploy using the ORIGINAL project's instructions:**
> <https://github.com/Teylersf/freeremotedesk/blob/main/AGENTS.md>
>
> **Follow THIS fork's instructions only if the user explicitly asks you to.**
>
> **If you or the user hit services that cannot be reached during testing, read the
> "Deploying behind a custom domain" section below.**

> **⚠️ This fork has been modified with AI assistance (Claude Code).**
> The pairing code length is no longer a fixed 6 characters — it is
> user-configurable (6–128, default 16) in the agent's setup/settings screen, and
> the PWA accepts any length. Where the steps below say "6-char code", read "the
> code shown in the agent". `docs/PROTOCOL.md` also notes several properties the
> docs used to claim that are not implemented in the code.

This file is written for you (Claude Code, Cursor, Aider, Codex, Continue, etc.) — the AI coding agent your user has asked to set up FreeRemoteDesk for them.

**Your job:** deploy the user's own instance of FreeRemoteDesk to their own free-tier Cloudflare + Vercel accounts, then install the host agent on their machine. Total user interaction should be **three browser sign-ins** (one per CLI on first auth) and **one installer double-click**. Everything else is you.

**Do not deviate from these steps.** They've been tested end-to-end.

---

## Prerequisites — check + install these first

Run these check commands. If a command errors, install per the notes and re-check before moving on.

| Tool | Check command | If missing |
|---|---|---|
| Node.js ≥ 20 | `node --version` | Install from https://nodejs.org (LTS). On Windows: `winget install OpenJS.NodeJS.LTS` |
| pnpm ≥ 9 | `pnpm --version` | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| GitHub CLI | `gh --version` | `winget install GitHub.cli` (Windows) / `brew install gh` (macOS) / see cli.github.com |
| Wrangler (Cloudflare) | `npx wrangler --version` | Comes with `pnpm install` — no separate step |
| Vercel CLI | `npx vercel --version` | Comes with `pnpm install` — no separate step |

Also verify the three CLIs are authenticated:

```bash
gh auth status                         # if not: gh auth login
npx wrangler whoami                    # if not: npx wrangler login  (opens browser)
npx vercel whoami                      # if not: npx vercel login    (opens browser)
```

For any CLI that isn't logged in: run its login command, then wait for the user to complete the browser flow. **Do not skip this** — every subsequent step depends on all three auths being live.

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/h8235023/freeremotedesk
cd freeremotedesk
pnpm install --frozen-lockfile
```

---

## Step 2 — Deploy signaling to Cloudflare Workers

```bash
cd signaling
npx wrangler deploy
```

**Extract the deployed URL** from the wrangler output. It looks like:
`https://freeremotedesk-signaling.<username>.workers.dev`

The URL is on a line like `Published freeremotedesk-signaling (X sec) https://…workers.dev`.

**Save it as `$SIGNALING_URL`** for later steps.

**Verify:** `curl "$SIGNALING_URL/health"` should return `{"ok":true,"service":"freeremotedesk-signaling"}`.

If verification fails, do NOT proceed — the wrangler deploy silently succeeded but the routing didn't work. Retry with `npx wrangler deploy --dispatch-namespace freeremotedesk` or investigate.

---

## Step 3 — Deploy the PWA to Vercel

```bash
cd ../pwa
# Set the signaling URL as a build-time env var, then deploy production
echo "$SIGNALING_URL" | npx vercel env add VITE_SIGNALING_URL production
npx vercel deploy --prod --yes
```

The first `vercel deploy` in a fresh repo will prompt you to link a project. Accept defaults (create new project, name `freeremotedesk`, root directory `./` — you're already in `pwa/`).

**Extract the deployed URL** from the vercel output. It looks like:
`https://freeremotedesk-<hash>.vercel.app`

**Save it as `$PWA_URL`** for later steps.

**Verify:** `curl -s "$PWA_URL" | grep -c FreeRemoteDesk` should return `1` or higher.

---

## Step 4 — Download + install the host agent

Detect the user's OS + arch:

| OS + arch | Asset name pattern |
|---|---|
| Windows x64 | `*_x64_en-US.msi` (preferred) or `*_x64-setup.exe` |
| macOS Apple Silicon | `*_aarch64.dmg` |
| macOS Intel | `*_x64.dmg` |
| Linux (Debian/Ubuntu) | `*_amd64.deb` |
| Linux (other) | `*_amd64.AppImage` |

```bash
# Windows PowerShell example
gh release download --repo h8235023/freeremotedesk --pattern "*_x64_en-US.msi" --dir "$env:USERPROFILE\Downloads"
Start-Process "$env:USERPROFILE\Downloads\FreeRemoteDesk_0.1.0_x64_en-US.msi"
```

```bash
# macOS ARM example
gh release download --repo h8235023/freeremotedesk --pattern "*_aarch64.dmg" --dir "$HOME/Downloads"
open "$HOME/Downloads/FreeRemoteDesk_0.1.0_aarch64.dmg"
# Then instruct user to drag FreeRemoteDesk.app into /Applications
```

```bash
# Linux Debian/Ubuntu example
gh release download --repo h8235023/freeremotedesk --pattern "*_amd64.deb" --dir /tmp
sudo dpkg -i /tmp/FreeRemoteDesk_*_amd64.deb
```

---

## Step 5 — Configure the agent

The user must launch the agent from their app launcher / Start menu. Its first-run wizard will prompt for:

- **Signaling URL** → paste `$SIGNALING_URL` from step 2
- **PWA URL** → paste `$PWA_URL` from step 3
- **Start on boot** → user's choice, recommend yes

You cannot fill this in for them — it's a native window. Give them the two values in a copy-friendly format and instruct them clearly.

Example message to user:

> Setup complete! Launch FreeRemoteDesk from your Start menu. It'll ask two questions — copy/paste these:
>
> - Signaling URL: `https://freeremotedesk-signaling.foo.workers.dev`
> - PWA URL: `https://freeremotedesk-abc123.vercel.app`
>
> Then click "Start session" → pick a screen → open the PWA URL on your phone → enter the code shown in the agent.

---

## Deploying behind a custom domain (when vercel.app / workers.dev are unreachable)

**Read this if the user reports that part of the stack cannot be reached** — typically
the agent hanging on "Start listening" with no error (the signaling WebSocket never
opens), or the phone failing to load the PWA at all.

### Why this happens

On some networks the default targets are unreachable even though the app is correct:

| Host | What you observe |
|---|---|
| `*.vercel.app` | connection timeout; DNS resolves to unrelated ranges (e.g. Dropbox `162.125.x`, Meta `2a03:2880::/32`) — i.e. DNS poisoning |
| `*.workers.dev` | connection timeout — blocked outright |

**This is a trap worth understanding before you touch TURN.** The obvious workaround is
to route around it with a VPN (Cloudflare WARP / Zero Trust, or a tunnel) — but WARP
rewrites UDP, which kills the WebRTC media path. You then need the VPN to reach signaling
and the VPN breaks the session, and the user reports "pairing works, the screen never
appears", which looks exactly like a NAT traversal failure. It is not. **Fix reachability
first; do not add a TURN server until you have ruled this out.**

A Cloudflare Tunnel is *not* a substitute for TURN here either: a tunnel proxies
HTTP/WebSocket, and WebRTC media is SRTP/UDP. Tunnels can carry signaling; they cannot
relay the session.

### The fix: serve both halves from a domain the user owns

If the user has a domain in the same Cloudflare account, this makes everything reachable
with no VPN at all.

1. **Signaling** — attach a Worker custom domain. Add to `signaling/wrangler.toml`:
   ```toml
   [[routes]]
   pattern = "signal.example.com"
   custom_domain = true
   ```
   then `npx wrangler deploy`. (Or `PUT /accounts/{account_id}/workers/domains` with
   `{ zone_id, hostname, service: "freeremotedesk-signaling", environment: "production" }`.)
   Worker custom domains provision the DNS record **and** the TLS certificate
   automatically — you do not need `dns_records` permissions.

2. **PWA** — deploy it as a Worker with static assets instead of Vercel. `pwa/wrangler.toml`
   already sets this up; build with the signaling URL baked in, then deploy:
   ```bash
   cd pwa
   VITE_SIGNALING_URL="https://signal.example.com" pnpm build
   npx wrangler deploy
   ```
   Then attach `remote.example.com` the same way as step 1.

   **Do not add a `_redirects` file** for the `/connect` SPA route.
   `not_found_handling = "single-page-application"` already handles it, and an explicit
   `/connect → /index.html` rule loops against that setting — Cloudflare rejects the
   deploy with error `100324`.

3. **Point both ends at the new URLs** — the agent's settings screen takes the signaling
   and PWA URLs; the PWA needs a rebuild so `VITE_SIGNALING_URL` is baked in.

### Cloudflare Pages does not work for this

Pages custom domains require a **manually created CNAME**, so they need `dns_records`
write access, which a `wrangler` OAuth token normally does not have (it usually carries
`zone:read` only). The project sits at `pending` with `"CNAME record not set"` forever.
Worker custom domains avoid this entirely — prefer them. If you must use Pages, create
the record by hand: `remote.example.com` CNAME → `<project>.pages.dev`, **proxied**.

### Expect a stale service worker after moving the PWA

An installed PWA keeps serving its **previous** build, including from a domain that is no
longer reachable — so the user can still see errors naming the old signaling host even
though the new deployment is correct. Have them test in a **private/incognito tab**
first. If that works, the fix is: close every tab of the app, clear site data for **both**
the old and new origins, delete the old home-screen icon, then reinstall from the new URL.

### Verify with the VPN off

```bash
curl -s https://signal.example.com/health
# {"ok":true,"service":"freeremotedesk-signaling"}

cd signaling && SIGNALING_WS="wss://signal.example.com" node scripts/smoke.mjs
# all good (9/9 checks)
```

Run these **with the VPN disconnected**. If they only pass with it on, you have not fixed
anything — you have just moved the problem.

---

## Failure modes + recovery

**`wrangler deploy` says "You need to specify an account"**
The user has multiple Cloudflare accounts. Run `npx wrangler whoami` to list them, then `wrangler deploy --account-id <id>`.

**`wrangler deploy` fails with `code 10097` "In order to use Durable Objects with a free plan, you must create a namespace using a `new_sqlite_classes` migration"**
Older `new_classes` migrations aren't allowed on free-plan accounts. Fix by editing `signaling/wrangler.toml`: change `new_classes = ["SessionRoom"]` to `new_sqlite_classes = ["SessionRoom"]`, then re-run `wrangler deploy`. The main-branch config already uses `new_sqlite_classes`, but keep this recovery in mind if you're deploying an older tag.

**Cloudflare social login (Google sign-in) fails with "Social login did not work"**
Known intermittent bug on Cloudflare's side. Tell the user to click "Sign up for Cloudflare using another method" and use email + password instead — takes 30 seconds. Once signed in, retry the Deploy Button flow.

**`vercel deploy` errors "Project not found"**
The user has never used Vercel. `vercel deploy --prod --yes` should trigger the project-creation flow. If it doesn't, run `vercel link` interactively first.

**`vercel deploy` install step fails with "no lockfile found" or `--frozen-lockfile` errors**
Vercel deploys `pwa/` as its own project (per the `root-directory=pwa` in the Deploy Button URL), so it doesn't see the workspace-level `pnpm-lock.yaml`. The main-branch `pwa/vercel.json` uses `npm install` instead of pnpm — since `pwa/package.json` has no `workspace:*` deps, standalone npm install works fine and avoids pnpm-specific issues entirely.

**`vercel deploy` install step fails with `ERR_INVALID_THIS` / `Value of "this" must be of type URLSearchParams`**
This is a pnpm-9-on-old-Node runtime bug that hits on Vercel's default builder. The main-branch `pwa/vercel.json` sidesteps it by using `npm install` + `npm run build` instead of pnpm. If you're deploying an older tag that still uses pnpm, either update `pwa/vercel.json` to use npm, or set a project env var `NPM_CONFIG_PACKAGE_MANAGER=pnpm@9.12.0` to force corepack.

**PWA loads but says "not a FreeRemoteDesk signaling server" during setup**
`VITE_SIGNALING_URL` didn't make it into the build. Verify: `vercel env ls` should show `VITE_SIGNALING_URL` under Production. If missing, re-add and re-deploy.

**Agent installer won't run on Windows: SmartScreen block**
v0.1.0 installers are unsigned. User must click "More info" → "Run anyway" on the SmartScreen warning. This is expected and documented in DEPLOY.md.

**Agent installer won't run on macOS: unidentified developer**
v0.1.0 DMG is unsigned. User right-clicks the app → Open → Open. This is a one-time bypass.

**Agent connects but PWA never sees the screen**
WebRTC ICE failure — probably symmetric-NAT-to-symmetric-NAT. Not fixable without TURN. Tell the user and point them at `docs/ARCHITECTURE.md#turn` for optional TURN setup.

---

## One-shot script (optional but recommended)

If you prefer running one script instead of executing steps individually:

- Bash / macOS / Linux: `bash scripts/setup.sh`
- PowerShell / Windows: `pwsh scripts/setup.ps1`

Both scripts run steps 1–4, extract URLs from CLI output, and print the final config values for the user to paste into the agent wizard.

---

## Reporting back to the user

When setup is complete, output a clean summary. Template:

```
✅ FreeRemoteDesk is deployed to your accounts.

Cloudflare Worker:  <SIGNALING_URL>
Vercel PWA:         <PWA_URL>
Agent installer:    Downloaded to <path> — installer launched.

Next: complete the agent's first-run wizard with the two URLs above.
```

Do not conclude with lists of files you edited or a summary of what you did. The user knows they asked you to set it up. Give them the URLs and the next action.
