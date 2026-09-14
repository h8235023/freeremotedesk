# 部署你自己的 FreeRemoteDesk

> [English](DEPLOY.md) · **简体中文**

> **⚠️ 这是一个修改版分支。** 原项目（upstream）：
> <https://github.com/Teylersf/freeremotedesk>。本仓库所有者与原项目所有者没有任何附属关系，
> 且双方均不对可用性做任何保障。**绝大多数人应当遵循原项目的安装说明，而不是本文档** ——
> 那才是持续维护的版本。只有当你明确需要本分支的改动（配对码长度可配置、界面双语、
> 支持托管到自定义域名）时，才继续往下看。
>
> **如果你所在网络访问不了部分服务**，请阅读
> [通过托管域名部署](../AGENTS.zh-CN.md)。`vercel.app` 和 `workers.dev` 在部分地区会被封锁或
> 遭到 DNS 污染，而用 VPN 绕过这一点会破坏 WebRTC 的媒体通道 —— 表现和 NAT 穿透失败一模一样。
> 在排除这一点之前，不要急着上 TURN。

FreeRemoteDesk 采用自带基础设施（BYO-infrastructure）的模式：你需要把信令 Worker 和 PWA 部署到自己的 Cloudflare 与 Vercel 免费账户上。除此之外没有任何人（包括项目维护者）能访问你的实例。

总成本：**每月 $0。** 总部署时间：首次约 **10 分钟**，之后无需任何操作。

## 你需要准备

- 一个 **GitHub 账号**（用于 fork 本仓库 —— Cloudflare 和 Vercel 都会从它拉取代码）
- 一个 **Cloudflare 账号** —— 免费套餐，无需信用卡
- 一个 **Vercel 账号** —— 免费套餐，无需信用卡
- 一台你想远程访问的机器 —— Windows / macOS / Linux

可选但推荐：

- 你自己的域名（Vercel 和 Cloudflare 都会为其子域名免费提供 HTTPS，所以并不需要自定义域名）

## 第 1 步 —— 部署信令 Worker

信令的作用是让你两台设备在互联网上找到彼此。每个会话它只转发少量小消息。Cloudflare Workers 免费套餐每天包含 100,000 次请求 —— 对个人使用来说绰绰有余。

1. 点击：**[Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/?url=https://github.com/h8235023/freeremotedesk)**
2. 登录你的 Cloudflare 账号（或注册一个）。
3. 授权 Cloudflare Deploy Button 把本仓库 fork 到你的 GitHub 账号。
4. Cloudflare 会构建并部署 Worker，大约 60 秒。
5. **复制它给出的 URL** —— 形如 `https://freeremotedesk-signaling.<yourname>.workers.dev`。

你可以在浏览器中打开 `<your-url>/health` 来验证部署是否成功 —— 应该返回 `{"ok":true,"service":"freeremotedesk-signaling"}`。

### 或者用 wrangler CLI 手动部署

如果你不想用 Deploy Button：

```bash
git clone https://github.com/h8235023/freeremotedesk
cd freeremotedesk/signaling
pnpm install
npx wrangler login
npx wrangler deploy
```

## 第 2 步 —— 把 PWA 部署到 Vercel

PWA 就是你在浏览器里打开、用来查看和控制远程机器的那个应用。Vercel 免费套餐每月提供 100 GB 带宽 —— 完全够用。

1. 点击：**[Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/h8235023/freeremotedesk&root-directory=pwa&env=VITE_SIGNALING_URL&envDescription=Signaling%20Worker%20URL%20from%20step%201&project-name=freeremotedesk&repository-name=freeremotedesk-pwa)**
2. 登录 Vercel（或注册一个账号）。
3. 当被提示时，把第 1 步得到的信令 URL 粘贴为 `VITE_SIGNALING_URL`。
4. Vercel 会构建并部署 PWA。大约需要 90 秒。
5. **复制 URL** —— 形如 `https://freeremotedesk-<random>.vercel.app`。

你可以立刻打开这个 URL —— PWA 会加载出来并显示配对码输入界面。

### 或者用 Vercel CLI 手动部署

```bash
cd freeremotedesk/pwa
pnpm install
pnpm build
npx vercel deploy --prod
```

之后再设置环境变量：

```bash
npx vercel env add VITE_SIGNALING_URL production
# paste the signaling URL when prompted
npx vercel deploy --prod  # redeploy so the env var takes effect
```

### 自定义域名（可选）

在 Vercel 的项目面板中依次进入 Settings → Domains → 添加你的域名。Vercel 会自动处理 DNS 和免费 HTTPS 证书。

## 第 3 步 —— 在主机上安装 agent

agent 运行在你想要远程访问的那台机器上。

1. 打开 [最新版本](https://github.com/h8235023/freeremotedesk/releases/latest)。
2. 下载对应你操作系统的安装包：
   - **Windows**：`FreeRemoteDesk-<version>-x64.msi`
   - **macOS (Intel)**：`FreeRemoteDesk-<version>-x64.dmg`
   - **macOS (Apple Silicon)**：`FreeRemoteDesk-<version>-aarch64.dmg`
   - **Linux (Debian/Ubuntu)**：`freeremotedesk_<version>_amd64.deb`
3. 运行安装程序。
4. 从开始菜单 / 应用程序中启动 FreeRemoteDesk。
5. 首次运行向导会询问：
   - **Signaling URL** —— 粘贴第 1 步得到的 URL
   - **PWA URL** —— 粘贴第 2 步得到的 URL（可选；会作为提示显示在配对界面上）
   - **Pairing code length** —— 每个生成的配对码的字符数，取值 6–128（默认 16）。越长越难被猜到。
6. 点击 **Save and continue**。

agent 现在已就绪。想暴露屏幕时，点击 **Start session**。它会弹出操作系统的屏幕选择器，让你选择要共享的屏幕或窗口。你会得到一个一次性配对码，并且每次配对都会重新生成一个新的。

## 第 4 步 —— 连接

在你的另一台设备上（手机、平板、笔记本电脑）：

1. 在浏览器中打开你的 PWA URL（Chrome、Edge、Safari、Firefox）。
2. 在移动端：从浏览器菜单点击 "Add to Home Screen" 把它作为 PWA 安装。
3. 输入主机 agent 上显示的配对码。
4. 点击 **Connect**。
5. 你应该能看到主机的屏幕。移动鼠标、打字 —— 一切都能正常工作。

## 故障排查

**PWA 在设置过程中提示 "not a FreeRemoteDesk signaling server"**
你的信令 URL 有误，或者 Worker 没有部署成功。检查 `<your-url>/health` 是否返回 `{"ok":true,...}`。

**agent 已连接，但 PWA 一直看不到屏幕**
在假定是 NAT 问题之前，先排除可达性。如果你为了访问信令或 PWA 而挂着 VPN / Zero Trust
（WARP），那个客户端极有可能就是破坏媒体通道的原因 —— 它会改写 UDP。参见
[通过托管域名部署](../AGENTS.zh-CN.md)：把两部分都搬到自己的域名下，就完全不需要 VPN 了。

只有当你在**关闭 VPN** 的情况下依然能访问两项服务、却仍然没有画面时，才轮到 WebRTC ICE 失败。
对称 NAT 对对称 NAT 的连接需要 TURN 服务器，而默认配置里没有。如果要加，注意 `turn:` /
`turns:` 还必须加进 agent 的 CSP `connect-src`（`agent/src-tauri/tauri.conf.json`）。

**输入事件到不了主机**
查看 agent 窗口的日志面板（目前仅开发版构建提供）。如果你看到 `inject_input failed` 消息，说明 enigo crate 出了问题 —— 请带着你的操作系统和版本提一个 issue。

**我想修改信令 URL**
Agent：在 agent 窗口中点击 "Settings" → 向导会重新出现。
PWA：在配对界面上点击 "Change signaling server"。

## 成本说明（给好奇的人）

Cloudflare Workers 免费套餐：每天 10 万次请求，每次请求 10ms CPU。信令每个配对会话约 10 次请求。即便是重度个人使用（每天 100 个会话），也只用到每日限额的约 1%。

Vercel 免费套餐：每月 100 GB 带宽。PWA 压缩后约 150 KB。被访问一百万次也毫无压力。

唯一可能产生账单的途径是你启用的 TURN 流量 —— Cloudflare Calls 收费 $0.05/GB，而 TURN 只在对称 NAT ↔ 对称 NAT 配对时才会启用（约占连接的 15–25%）。对个人使用来说，通常每月也就几分钱。
