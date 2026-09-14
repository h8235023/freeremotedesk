# 面向 AI 编程代理的安装说明

> [English](AGENTS.md) · **简体中文**

> 说明：本文档仅为参考译文。交给 AI 代理执行的仍应以 `AGENTS.md`（英文版）为准，因为其中的安装提示词是用英文编写的。

> **⚠️ 本分支是在 AI 辅助下（Claude Code）修改的。**
> 配对码长度不再是固定的 6 个字符——现在可以在代理端的设置界面中由用户自行配置
> （6–128，默认 16），并且 PWA 接受任意长度的配对码。下文步骤中凡出现
> “6 位配对码”的地方，请理解为“代理端显示的那个配对码”。此外，`docs/PROTOCOL.md`
> 中记录的若干特性实际上并未在代码中实现。

本文件是写给你的（Claude Code、Cursor、Aider、Codex、Continue 等）——也就是用户请来帮忙部署 FreeRemoteDesk 的那个 AI 编程代理。

**你的任务：** 把用户自己的 FreeRemoteDesk 实例部署到他们自己的 Cloudflare + Vercel 免费账户上，然后在他们机器上安装主机代理（host agent）。用户全程只需要 **三次浏览器登录**（每个 CLI 首次认证各一次）和 **双击一次安装包**。其余全部由你完成。

**务必严格按以下步骤执行，不要擅自改动。** 这些步骤已经过端到端验证。

---

## 前置条件——先检查并安装这些依赖

运行以下检查命令。如果某条命令报错，按备注安装后重新检查，确认无误再继续。

| 工具 | 检查命令 | 缺失时如何处理 |
|---|---|---|
| Node.js ≥ 20 | `node --version` | 从 https://nodejs.org 安装（LTS 版）。Windows 上：`winget install OpenJS.NodeJS.LTS` |
| pnpm ≥ 9 | `pnpm --version` | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| GitHub CLI | `gh --version` | `winget install GitHub.cli`（Windows）/ `brew install gh`（macOS）/ 或访问 cli.github.com |
| Wrangler (Cloudflare) | `npx wrangler --version` | 随 `pnpm install` 一起安装——无需额外步骤 |
| Vercel CLI | `npx vercel --version` | 随 `pnpm install` 一起安装——无需额外步骤 |

同时确认这三个 CLI 都已通过认证：

```bash
gh auth status                         # if not: gh auth login
npx wrangler whoami                    # if not: npx wrangler login  (opens browser)
npx vercel whoami                      # if not: npx vercel login    (opens browser)
```

对于任何尚未登录的 CLI：运行其登录命令，然后等待用户在浏览器中完成授权流程。**这一步不能跳过**——后续每一步都依赖于这三个认证都处于有效状态。

---

## 步骤 1 —— 克隆仓库

```bash
git clone https://github.com/Teylersf/freeremotedesk
cd freeremotedesk
pnpm install --frozen-lockfile
```

---

## 步骤 2 —— 把信令服务部署到 Cloudflare Workers

```bash
cd signaling
npx wrangler deploy
```

**从 wrangler 的输出中提取部署后的 URL**。它形如：
`https://freeremotedesk-signaling.<username>.workers.dev`

该 URL 出现在类似 `Published freeremotedesk-signaling (X sec) https://…workers.dev` 的这一行上。

**把它保存为 `$SIGNALING_URL`**，供后续步骤使用。

**验证：** `curl "$SIGNALING_URL/health"` 应当返回 `{"ok":true,"service":"freeremotedesk-signaling"}`。

如果验证失败，**不要**继续往下做——wrangler 部署看似成功，但路由并未生效。请改用 `npx wrangler deploy --dispatch-namespace freeremotedesk` 重试，或进一步排查原因。

---

## 步骤 3 —— 把 PWA 部署到 Vercel

```bash
cd ../pwa
# Set the signaling URL as a build-time env var, then deploy production
echo "$SIGNALING_URL" | npx vercel env add VITE_SIGNALING_URL production
npx vercel deploy --prod --yes
```

在全新的仓库中，第一次执行 `vercel deploy` 会提示你关联一个项目。接受默认选项即可（创建新项目，名称为 `freeremotedesk`，根目录为 `./`——因为你当前已经在 `pwa/` 目录下了）。

**从 vercel 的输出中提取部署后的 URL**。它形如：
`https://freeremotedesk-<hash>.vercel.app`

**把它保存为 `$PWA_URL`**，供后续步骤使用。

**验证：** `curl -s "$PWA_URL" | grep -c FreeRemoteDesk` 应当返回 `1` 或更大。

---

## 步骤 4 —— 下载并安装主机代理

检测用户的操作系统和架构：

| 操作系统 + 架构 | 安装包名称模式 |
|---|---|
| Windows x64 | `*_x64_en-US.msi`（首选）或 `*_x64-setup.exe` |
| macOS Apple Silicon | `*_aarch64.dmg` |
| macOS Intel | `*_x64.dmg` |
| Linux (Debian/Ubuntu) | `*_amd64.deb` |
| Linux（其他发行版） | `*_amd64.AppImage` |

```bash
# Windows PowerShell example
gh release download --repo Teylersf/freeremotedesk --pattern "*_x64_en-US.msi" --dir "$env:USERPROFILE\Downloads"
Start-Process "$env:USERPROFILE\Downloads\FreeRemoteDesk_0.1.0_x64_en-US.msi"
```

```bash
# macOS ARM example
gh release download --repo Teylersf/freeremotedesk --pattern "*_aarch64.dmg" --dir "$HOME/Downloads"
open "$HOME/Downloads/FreeRemoteDesk_0.1.0_aarch64.dmg"
# Then instruct user to drag FreeRemoteDesk.app into /Applications
```

```bash
# Linux Debian/Ubuntu example
gh release download --repo Teylersf/freeremotedesk --pattern "*_amd64.deb" --dir /tmp
sudo dpkg -i /tmp/FreeRemoteDesk_*_amd64.deb
```

---

## 步骤 5 —— 配置代理

用户必须从应用启动器 / 开始菜单中启动该代理。首次运行的向导会提示填写：

- **Signaling URL（信令服务地址）** → 粘贴步骤 2 得到的 `$SIGNALING_URL`
- **PWA URL** → 粘贴步骤 3 得到的 `$PWA_URL`
- **Start on boot（开机自启）** → 由用户决定，建议选“是”

这一步你无法替用户完成——那是一个原生窗口。请把这两个值以方便复制粘贴的形式提供给他们，并清楚地说明该怎么操作。

给用户的消息示例：

> 部署完成！请从开始菜单启动 FreeRemoteDesk。它会问你两个问题——把下面两段内容复制粘贴进去：
>
> - Signaling URL: `https://freeremotedesk-signaling.foo.workers.dev`
> - PWA URL: `https://freeremotedesk-abc123.vercel.app`
>
> 然后点击 "Start session" → 选择要共享的屏幕 → 在手机上打开 PWA 网址 → 输入代理端显示的配对码。

---

## 失败情形与恢复方法

**`wrangler deploy` 提示 "You need to specify an account"**
该用户拥有多个 Cloudflare 账户。运行 `npx wrangler whoami` 列出所有账户，然后执行 `wrangler deploy --account-id <id>`。

**`wrangler deploy` 失败，报错 `code 10097` "In order to use Durable Objects with a free plan, you must create a namespace using a `new_sqlite_classes` migration"**
免费套餐账户不允许使用较早的 `new_classes` 迁移方式。解决办法是编辑 `signaling/wrangler.toml`：把 `new_classes = ["SessionRoom"]` 改成 `new_sqlite_classes = ["SessionRoom"]`，然后重新运行 `wrangler deploy`。主分支的配置已经使用 `new_sqlite_classes`，但如果你部署的是较旧的 tag，请记得用这个办法恢复。

**Cloudflare 社交登录（Google 登录）失败，提示 "Social login did not work"**
这是 Cloudflare 那边已知的偶发 bug。让用户点击 "Sign up for Cloudflare using another method"，改用邮箱 + 密码注册——只需 30 秒。登录成功后，重新走 Deploy Button 流程即可。

**`vercel deploy` 报错 "Project not found"**
该用户从未使用过 Vercel。`vercel deploy --prod --yes` 本应触发项目创建流程。如果没有触发，请先交互式运行 `vercel link`。

**`vercel deploy` 的安装步骤失败，提示 "no lockfile found" 或 `--frozen-lockfile` 相关错误**
Vercel 是把 `pwa/` 作为独立项目来部署的（依据 Deploy Button URL 中的 `root-directory=pwa`），因此它看不到工作区级别的 `pnpm-lock.yaml`。主分支的 `pwa/vercel.json` 使用 `npm install` 而不是 pnpm——由于 `pwa/package.json` 不包含 `workspace:*` 依赖，直接用 npm 独立安装完全没问题，还能彻底避开 pnpm 特有的各种坑。

**`vercel deploy` 的安装步骤失败，报错 `ERR_INVALID_THIS` / `Value of "this" must be of type URLSearchParams`**
这是 pnpm 9 在旧版 Node 运行时上的 bug，会在 Vercel 默认构建器中触发。主分支的 `pwa/vercel.json` 用 `npm install` + `npm run build` 取代 pnpm，从而绕开了这个问题。如果你部署的是仍在用 pnpm 的较旧 tag，要么把 `pwa/vercel.json` 改成使用 npm，要么设置项目环境变量 `NPM_CONFIG_PACKAGE_MANAGER=pnpm@9.12.0` 来强制走 corepack。

**PWA 能加载，但在配置过程中提示 "not a FreeRemoteDesk signaling server"**
说明 `VITE_SIGNALING_URL` 没有进入构建产物。验证方法：`vercel env ls` 应当能在 Production 下看到 `VITE_SIGNALING_URL`。如果缺失，重新添加该变量并重新部署。

**Windows 上代理安装程序无法运行：SmartScreen 拦截**
v0.1.0 的安装包未签名。用户需要在 SmartScreen 警告中点击 "More info" → "Run anyway"。这是预期行为，DEPLOY.md 中也有相关说明。

**macOS 上代理安装程序无法运行：未识别的开发者**
v0.1.0 的 DMG 未签名。用户需右键点击应用 → 打开 → 确认打开。这是一次性的绕过操作。

**代理已连接，但 PWA 始终看不到画面**
这是 WebRTC ICE 失败——很可能是对称 NAT 到对称 NAT 的情形。没有 TURN 就无法解决。请告知用户，并引导他们查看 `docs/ARCHITECTURE.md#turn` 了解可选的 TURN 配置方案。

---

## 一键脚本（可选，但推荐）

如果你更希望只运行一个脚本，而不是逐条执行各步骤：

- Bash / macOS / Linux：`bash scripts/setup.sh`
- PowerShell / Windows：`pwsh scripts/setup.ps1`

这两个脚本都会执行步骤 1–4，从 CLI 输出中提取 URL，并打印出最终的配置值，供用户粘贴到代理向导中。

---

## 向用户汇报

部署完成后，输出一份简洁的总结。模板如下：

```
✅ FreeRemoteDesk is deployed to your accounts.

Cloudflare Worker:  <SIGNALING_URL>
Vercel PWA:         <PWA_URL>
Agent installer:    Downloaded to <path> — installer launched.

Next: complete the agent's first-run wizard with the two URLs above.
```

结尾不要罗列你编辑过的文件清单，也不要总结你做了哪些事情。用户清楚是自己让你去部署的。把 URL 和下一步操作告诉他们就够了。
