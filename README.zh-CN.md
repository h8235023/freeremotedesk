# FreeRemoteDesk

> [English](README.md) · **简体中文**

从任意浏览器远程连接你家里的开发机。无需自建服务器，没有任何月费，整条链路都归你自己掌控。

---

> ## ⚠️ 这是一个修改版分支 —— 部署前请先读这里
>
> **原项目（upstream）：<https://github.com/Teylersf/freeremotedesk>**
>
> 本仓库是它的一个分支（fork）。**本仓库所有者与原项目所有者没有任何附属关系，
> 且本分支所有者与原项目所有者均不对可用性做任何保障。**
>
> **本分支完全使用AI修改，模型：deepseek-v4.1-flash，请注意其安全性也不被保障（尽管未对具有安全性部分的主要代码有修改）。**
>
> **绝大多数人应该用原项目，而不是这个分支** —— 那才是原作者维护、安装说明持续更新的版本：
> <https://github.com/Teylersf/freeremotedesk/blob/main/AGENTS.md>
>
> 只有当你明确需要下面列出的改动时，才用这个分支。

> **本分支相对原项目改了什么：**
> - **配对码长度可配置**（6–128，默认 16），不再是固定的 6 位，PWA 也不再假设任何长度。
>   每次配对仍会重新生成新码。
> - **界面与文档双语** —— 默认简体中文，可运行时切换到英文。
> - **支持部署到自定义域名**，替代 `vercel.app` / `workers.dev`，用于那些域名不可达的网络环境。
>   详见 [通过托管域名部署](AGENTS.zh-CN.md)。
> - `docs/PROTOCOL.md` 记录了一些原文档声称拥有、但在代码中**任何地方都找不到**的属性。

---

## 安装 — 选择适合你的方式

> 下面的命令用的是**本分支**的仓库地址。如果你想改用原项目（**我们推荐这样做**），
> 把命令里所有 `https://github.com/h8235023/freeremotedesk` 替换为
> `https://github.com/Teylersf/freeremotedesk` 即可。

### 🤖 方式 A：把这个仓库丢给你的 AI 编程助手（推荐给喜欢“感觉编程”的朋友）

打开你的 AI 编程工具（Claude Code、Cursor、Aider、Codex、Continue —— 只要能开终端就行），粘贴下面这一行：

> **"Set up FreeRemoteDesk for me. Read AGENTS.md at https://github.com/h8235023/freeremotedesk/blob/main/AGENTS.md and follow it exactly."**

你的 AI 助手会：
- 检查你是否安装了 `node`、`pnpm`、`gh`（缺失则自动安装）
- 引导你登录 `gh`、`wrangler` 和 `vercel`（三次一次性的浏览器登录）
- 把信令 Worker 部署到你的 Cloudflare 账号
- 把 PWA 部署到你的 Vercel 账号，并带上正确的环境变量
- 下载对应你操作系统的宿主端安装包
- 把两个 URL 交给你，供你粘贴到 agent 的首次运行向导里

**用户总共要做的事：** 三次 CLI 登录 + 双击一次安装包 + 复制粘贴两个 URL。

### 🖱️ 方式 B：点两个部署按钮 + 下载一次（不需要 AI）

1. 把信令部署到你的 Cloudflare：[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/h8235023/freeremotedesk)
2. 把 PWA 部署到你的 Vercel：[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/h8235023/freeremotedesk&root-directory=pwa&env=VITE_SIGNALING_URL&envDescription=Cloudflare%20signaling%20URL%20from%20step%201&project-name=freeremotedesk&repository-name=freeremotedesk-pwa)
3. 下载 [latest release](https://github.com/h8235023/freeremotedesk/releases/latest)，安装，把两个 URL 粘贴到向导里。

完整操作流程：[`docs/DEPLOY.md`](docs/DEPLOY.zh-CN.md)。

### 🧑‍💻 方式 C：自己运行安装脚本

如果你已经装好了这些 CLI，也不想在界面里点来点去：

```bash
git clone https://github.com/h8235023/freeremotedesk
cd freeremotedesk
bash scripts/setup.sh      # macOS/Linux
# or
pwsh scripts/setup.ps1     # Windows
```

这个脚本会完成方式 A 的全部工作，只是没有 AI 在旁边解说。

---

## 为什么选它

- **没有中间商。** 信令跑在你自己的 Cloudflare 上，PWA 跑在你自己的 Vercel 上。任何人（包括我们）都不会插在你的设备之间。
- **没有月账单。** 免费额度足够轻松支撑个人使用，你花 $0。
- **不依赖应用商店。** PWA 可以从任意浏览器安装到手机/平板/桌面端。
- **基于 WebRTC 的点对点直连。** 视频和输入在你的两台设备之间直接传输；信令每次会话不到 1 KB。
- **Passkey 保护的已保存主机** *(v0.2.0，即将推出)* —— 用生物识别重新连接，无需再输入配对码。

## 仓库结构

| 路径 | 说明 |
|---|---|
| `agent/` | Tauri v2 + Rust 宿主端 agent —— WebView 负责 WebRTC 和 `getDisplayMedia`，Rust 通过 `enigo` 实现操作系统层面的输入注入 |
| `pwa/` | React + Vite PWA —— 浏览器端的查看器 |
| `signaling/` | Cloudflare Workers Durable Object 中继 |
| `scripts/setup.{sh,ps1}` | 一键自动化部署 |
| `AGENTS.md` | 给代你完成部署的 AI 助手使用的结构化指令 |
| `docs/` | 架构、部署、协议、安全、开发、国际化文档 |

## 多语言

PWA、Agent 窗口以及本文档都提供**简体中文（默认）和英文**两种语言 —— 可以在运行时通过
任意一端界面上的切换器切换。每个文档都有对应的 `.zh-CN.md` 姊妹文件；英文文件仍是正式
版本。机制说明与新增语言的方法见 [`docs/I18N.zh-CN.md`](docs/I18N.zh-CN.md)。

## 本地开发

在仓库根目录开三个终端：

```powershell
pnpm dev:signaling   # Miniflare on :8787
pnpm dev:pwa         # Vite on :5173
pnpm dev:agent       # Tauri window
```

两个向导都接受把 `http://localhost:8787` 作为信令 URL。

冒烟测试信令：`pnpm --filter @freeremotedesk/signaling smoke`。

完整配置说明：[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.zh-CN.md)。

## 架构（30 秒速览）

agent 是一个 Tauri 应用，它的 WebView 调用 `navigator.mediaDevices.getDisplayMedia()` 以及浏览器标准的 WebRTC —— 没有自定义视频编解码器，也没有原生采集层。PWA 客户端使用同样的 WebRTC API。信令由一个 Cloudflare Worker 加每个配对码一个 Durable Object 组成 —— 它只负责转发 SDP/ICE，视频由 DTLS-SRTP 端到端加密，永远不会经过信令基础设施。输入事件通过 WebRTC DataChannel 回传，并在宿主端通过 Rust 的 `enigo` 注入。

完整设计与设计取舍：[`ARCHITECTURE.md`](ARCHITECTURE.zh-CN.md)。

## 项目状态

**v0.1.0 已发布**（原项目）—— 第一阶段 MVP + 自带基础设施（BYO-infra）转向 + 第四阶段打包均已完成。本分支的构建产物见 [releases page](https://github.com/h8235023/freeremotedesk/releases)。

**v0.2.0 计划中** —— WebAuthn/passkey 已保存主机、生物识别重连、会话 PIN 作为兜底方案。

## 许可证

Apache-2.0（待定 —— 会在 v0.2.0 之前最终确定）。
