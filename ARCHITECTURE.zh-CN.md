# 架构

> [English](ARCHITECTURE.md) · **简体中文**

本文记录的是初期规划阶段已经拍板的决策。这是一份"为什么选 X 而不选 Y"的文档——在打算偏离之前，请先重读一遍。

## 非目标

- 企业级设备管理。这不是 MeshCentral。
- 像 TeamViewer 那样的通用远程支持。我们的目标用户是"机器的主人远程访问自己的机器"。
- Windows 服务器 / RDP 农场这类使用场景。

## 约束条件

- **每月固定服务器成本为零。** 信令跑在 Cloudflare Workers 免费套餐上。TURN 仅在需要时启用（按 GB 计费，极少触发）。
- **PWA 优先。** 客户端在浏览器中运行，并可安装到主屏幕——不依赖任何应用商店。
- **Passkey 为主的身份认证。** WebAuthn 是现代答案；对于没有生物识别能力的设备，TOTP 作为兜底方案。
- **默认直连 P2P。** 视频和输入数据永远不会经过我们的基础设施。

## 技术选型

| 层次 | 选择 | 理由 |
|---|---|---|
| 主机端运行时 | **Tauri v2 + Rust** | 二进制体积小（约 5MB），操作系统集成能力出色，拥有最好的屏幕捕获 crate（`scap`、`windows-capture`），通过 `webrtc-rs` 支持 WebRTC |
| 主机端 UI 外壳 | Tauri 内嵌 HTML/TS | 各平台 UI 保持一致；只用于配置/状态流程——并非主要产品界面 |
| 客户端 | **React 18 + Vite + TypeScript** | 生态普及、WebRTC 库生态庞大、通过 `vite-plugin-pwa` 支持 PWA |
| 客户端 UI | Tailwind + shadcn/ui | 迭代快、暗色模式零成本、默认移动端优先 |
| 信令 | **Cloudflare Workers + Durable Objects** | 免费套餐每天覆盖 10 万次请求；DO 让我们无需数据库即可拥有有状态的配对会话 |
| 认证存储 | Cloudflare D1 (SQLite) | 免费套餐：每天 500 万次读取。对认证记录来说足够了。 |
| 认证 | **基于 `@simplewebauthn` 的 WebAuthn** 为主，基于 `otplib` 的 TOTP 兜底 | Passkey = 生物识别解锁，没有共享密钥，可抵御钓鱼攻击 |
| 包管理器 | pnpm workspaces | 快、省磁盘，对 monorepo 有一等支持 |
| 传输 | WebRTC（视频走 DTLS-SRTP，输入走加密 DataChannel） | 浏览器原生、端到端加密、借助 STUN 直连 P2P，失败时通过 TURN 兜底 |
| STUN | Google 的 `stun.l.google.com:19302` | 免费、公开、可靠。备用列表约 4 台服务器。 |
| TURN | Cloudflare Calls TURN | $0.05/GB 按量付费——极少触发（只有对称 NAT ↔ 对称 NAT 才需要） |

## 数据流

### 配对（每台客户端设备仅需一次）

```
[主机端 agent]              [信令服务]                [PWA 客户端]
     │                          │                          │
     │─POST /pair/new─────────►│                          │
     │                          │                          │
     │◄─── {code: "x7k2q9"} ────│                          │
     │                          │                          │
     │  （主机端展示配对码 + QR）  │                          │
     │                          │                          │
     │                          │◄──POST /pair/claim───────│
     │                          │   {code: "x7k2q9"}       │
     │                          │                          │
     │◄─────WebSocket：对端上线（经 Durable Object）───────►│
     │                                                     │
     │◄──────────WebRTC SDP/ICE 交换───────────────────────►│
     │                                                     │
     │                （WebAuthn 流程——创建 passkey）        │
     │                                                     │
     │◄════════════ WebRTC 直连通道 ══════════════════════►│
```

配对之后：
- 客户端保存一份设备凭据（在主机端注册的 WebAuthn 凭据 ID + 公钥）
- 主机端保存客户端的公钥
- 后续连接可跳过配对码——客户端出示凭据，主机端通过 WebAuthn 断言进行验证

### 会话（再次连接）

```
[PWA 客户端]  ──POST /session/init {host-id, credential-id}──►  [信令服务]
                                                                    │
                                                                    │─推送通知──►  [主机端 agent]
                                                                    │
              ◄──WebRTC 信令中继（SDP/ICE，约 5 条消息）──────────►
              
              ◄══════════ WebRTC 直连通道 ══════════════════════►  [主机端 agent]
```

## 信令服务究竟做了什么

- **无状态**，配对/会话相关的 Durable Objects 除外（若 60 秒内无人认领则自动过期）。*（这 60 秒自动过期**未在代码中找到**——没有任何地方设置或强制执行 TTL；见 [`docs/PROTOCOL.zh-CN.md`](docs/PROTOCOL.zh-CN.md#此前记载于此的特性)。）*
- **永远看不到会话内容。** 只转发 SDP offer/answer 和 ICE candidate。所有内容均由 DTLS-SRTP 端到端加密。
- **鉴权关卡。** 在允许客户端认领某台主机之前，先验证 WebAuthn 断言。
- **默认没有用户账号。** 信任关系建立在设备对之间，而非用户之间。（用户账号可以日后叠加，用于多设备管理。）

## 我们不需要自己造的东西

- 自研 NAT 穿透——WebRTC 已经搞定
- 视频编解码器——每套 WebRTC 栈里浏览器都自带 VP8/VP9/H.264/AV1
- 音频编解码器——Opus，同理
- 加密——DTLS-SRTP 在 WebRTC 中是强制的，白送
- 传输层 TLS——信令部分由 CF 负责；WebRTC 无论如何都是端到端加密

得益于对浏览器原生能力的复用，我们省掉了 RustDesk 大约 5 年的工程量。

## 待解问题（进入 Phase 2 之前需处理）

- **TURN 服务商选择**——Cloudflare Calls 还是在那台 $5 的 Linode 上自建 coturn。等我们实测出真实环境中的对称 NAT 比例后再定。
- **主机离线时的持久化通知**——我们要不要做"通过移动端推送唤醒主机"的流程？取决于用户的家里那台机器是否常年休眠。
- **多显示器**——WebRTC 屏幕共享是单 track 的。多显示器要么需要多条 track，要么需要按显示器逐台连接的流程。
- **文件传输**——WebRTC DataChannel 能做；属于 Phase 4+ 的锦上添花。
- **剪贴板同步**——用 DataChannel，很简单。与文件传输同期。
- **输入延迟预算**——目标：局域网内往返 <50 ms，跨洲 <150 ms。用 `RTCStatsReport.roundTripTime` 来测量。
