# 开发环境搭建

在本地构建并运行 FreeRemoteDesk 所需的全部内容。以 Windows 为主（宿主机是 Windows），但 pwa 和 signaling 部分在 macOS/Linux 上完全相同。

> [English](DEVELOPMENT.md) · **简体中文**

## 工具链 —— 需要安装的东西

| 工具 | 版本 | 当前是否已装 | 安装命令 |
|---|---|---|---|
| Node.js | ≥ 20 | **22.19.0** ✓ | `winget install OpenJS.NodeJS.LTS` |
| pnpm | ≥ 9 | ✗ | `corepack enable; corepack prepare pnpm@9.12.0 --activate` |
| Rust (rustup) | stable | ✗ | `winget install --id Rustlang.Rustup` 然后 `rustup default stable` |
| MSVC Build Tools | 2022, C++ workload | ✗ | `winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`（下载约 5 GB，安装后约 10 GB） |
| WebView2 Runtime | latest | ✓（随 Win11 一起提供） | — |
| Wrangler CLI（用于部署 signaling） | ≥ 3.90 | ✗ | 通过 `pnpm install` 自动安装 |

只有 **pnpm**、**Rust** 和 **MSVC Build Tools** 需要你手动处理。装上之后，其他一切都能通过 `pnpm install` 搞定。

### 逐条批准安装命令

在 PowerShell 中复制粘贴（MSVC 需要管理员权限）：

```powershell
# 1. pnpm — 10 秒
corepack enable
corepack prepare pnpm@9.12.0 --activate

# 2. Rust — 下载 + 安装约 3 分钟
winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements
# 重启 shell，然后执行：
rustup default stable

# 3. MSVC Build Tools — 约 15 分钟，需要管理员权限
winget install --id Microsoft.VisualStudio.2022.BuildTools `
  --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
  --accept-package-agreements --accept-source-agreements
```

## 首次安装

工具链就位后，在仓库根目录执行：

```powershell
pnpm install
```

这一条命令会一次性装好 `pwa/`、`signaling/` 和 `agent/` 的 Node 依赖（workspace 感知）。

## 运行各个部分

每一部分都在独立的终端里运行。

### PWA（浏览器客户端）

```powershell
pnpm dev:pwa
# → http://localhost:5173
```

加载配对码输入界面。在 Phase 1 中，它会通过 WebRTC 连接到 agent。

### Signaling 服务（本地 Cloudflare Workers 开发）

```powershell
pnpm dev:signaling
# → http://localhost:8787
```

Wrangler 借助 `miniflare` 在本地运行 Worker + Durable Objects。本地开发不需要 CF 账号。但最终执行 `wrangler deploy` 时需要。

### 宿主机 agent

```powershell
pnpm dev:agent
```

运行 Tauri dev —— 会在你的桌面上打开 agent 窗口。首次运行要编译约 200 个 Rust 依赖，耗时 3–5 分钟。之后的运行是增量编译（<10 秒）。

## 最终会需要的云服务

| 服务 | 免费额度限制 | 用途 |
|---|---|---|
| **Cloudflare** 账号 | Workers 每天 10 万次请求；Durable Objects 每月 100 万次请求；D1 每天 500 万次读 | Signaling + 认证存储 |
| **Vercel** 账号 | 每月 100 GB 带宽；无限静态托管 | 在 `freeremotedesk.com` 上托管 PWA |
| **域名** `freeremotedesk.com` | 你说过要在 Vercel 上购买这个域名 —— 完美 | 根域名（Vercel），子域名 `signaling.freeremotedesk.com`（Cloudflare） |

关于 DNS 拆分：把 apex/裸域名指向 Vercel，然后把 `signaling` 子域名委托给 Cloudflare（如果 apex 在别处，Cloudflare 允许通过仅 CNAME 的方式让他们为一部分记录提供 nameserver）。

## 部署（Phase 2+）

```powershell
# PWA 部署到 Vercel
cd pwa; vercel deploy --prod

# Signaling 部署到 Cloudflare
cd signaling
wrangler login              # 只需一次
wrangler d1 create freeremotedesk-auth   # 把返回的 id 粘贴到 wrangler.toml
wrangler deploy

# Agent 安装包
cd agent; pnpm tauri:build
# → agent/src-tauri/target/release/bundle/{msi,dmg,deb}
```

## 常见坑点

- **装完之后找不到 Rust `cargo`** —— 重启 shell；rustup 在安装时会把 `~/.cargo/bin` 加到 PATH，但已经打开的 shell 看不到。
- **Tauri 构建失败，报 "link.exe not found"** —— MSVC Build Tools 安装时没带上 C++ workload。按上面的 winget 命令原样重新执行一遍。
- **Wrangler 提示要浏览器登录** —— 首次 `wrangler login` 时这是正常的。它会批准一个 token，存放在 `~/.wrangler`。
- **PWA 的 WebRTC 在 localhost 上因没有 HTTPS 而失败** —— Chrome 把 `localhost` 视为安全上下文，所以可以正常工作。如果要在局域网内跨设备测试，PWA 就需要 HTTPS —— 可以用 `vite --https`，或者用 Cloudflare Tunnel 快速拿到一个公网 URL。

## 安装前先确认脚手架

你现在就可以用任意编辑器查看整个结构。目前什么都还没运行过。
