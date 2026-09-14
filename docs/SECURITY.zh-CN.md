# 安全模型

> [English](SECURITY.md) · **简体中文**

## 威胁模型

我们假设：
- 信令服务器是**诚实但好奇的（honest-but-curious）**（它由我们运行，但设计必须在它被攻陷时依然站得住）。
- 网络完全对抗（Dolev-Yao）—— 每个数据包都可能被观察、丢弃或篡改。
- 用户已配对的设备是可信的。如果你的笔记本电脑被盗且处于解锁状态，攻击者就拥有了你的远程桌面。这一边界我们依赖操作系统级别的设备认证（passkey + 生物识别）来守住。

## 保证

| 属性 | 实现方式 |
|---|---|
| 机密性（视频、输入） | WebRTC DTLS-SRTP —— 强制启用，端到端。信令服务器能看到 SDP，但看不到密钥或内容。 |
| 完整性 | 每个数据包都有 DTLS-SRTP MAC。 |
| 真实性 | 配对时的 WebAuthn 仪式把设备凭据绑定到特定的主机 agent 上。每个会话都是一次全新的 WebAuthn 断言质询。 |
| 抗重放 | 每次会话初始化中都带有 nonce；每次连接都会协商短期 WebRTC 会话密钥。 |
| 信令服务器被攻陷 | 攻击者可以对配对发起 DoS，但无法解密会话、伪造新的配对（WebAuthn 会阻止他们），也无法冒充已配对的设备。 |

## 我们**不**保证什么

- **端点被攻陷。** 如果你的主机被拿下，我们无能为力。操作系统级别的屏幕捕获就是本产品的全部。
- **元数据隐私。** 信令服务器能看到哪些 agent ID 在何时与哪些 client ID 通信。它永远看不到内容。
- **匿名性。** ICE 收集期间 IP 是可见的（这对 P2P 是必需的）。如果你需要向对端隐藏自己的家庭 IP，请使用仅 TURN 模式（可在 Phase 4 中实现）。

## 认证流程（细节）

### 配对时（一次性）

1. 主机 agent 在安装时生成 ed25519 密钥对。公钥在本地注册。
2. 主机 agent 向信令请求配对码。得到 `x7k2q9`，有效期 60 秒。*（这 60 秒的有效期**并未在代码中强制执行**——见[速率限制](#速率限制)。）*
3. 用户把配对码读给 PWA 客户端（或扫描二维码）。
4. PWA 以配对码 + PWA 的 WebAuthn 凭据创建选项 POST `pair.claim`。
5. 信令完成匹配，在两者之间打开一条双向通道。
6. WebAuthn 仪式：用户浏览器弹出提示要求生物识别/PIN，创建绑定到 `freeremotedesk.com`（rpId）的凭据。
7. PWA 通过信令把凭据 ID + attestation 发送给 agent。
8. Agent 验证 attestation，存储凭据 ID。
9. 双方现在可以协商 WebRTC。

### 会话时（之后每次连接）

1. PWA 向信令出示 `credentialId`。
2. 信令把质询转发给主机 agent（连接时该 agent 必须在线）。
3. 主机 agent 生成一个每会话 nonce，通过信令发送给 PWA。
4. PWA 执行 WebAuthn `get()` —— 用户生物识别解锁凭据，对 nonce 签名。
5. 断言发送至信令，再转发给 agent。
6. Agent 依据已存储的凭据公钥验证断言。
7. 继续进行 WebRTC 协商。

## 速率限制

> **⚠️ 未在代码中找到——保留仅供参照。**
> 下面这些限制在本仓库中均未实现。`signaling/wrangler.toml` 里没有
> `env.RATE_LIMITER` 绑定（该文件明确写着 “no rate limit binding required for
> MVP”），Worker 从不读取客户端 IP，配对码也不存在任何 TTL 或一次性消费逻辑——
> 房间的生命周期仅仅取决于对端连接是否还在。这段文字是**保留而非删除**的，因为
> 它们描述的可能是底层平台（Cloudflare 边缘节点 / Durable Objects）提供的行为，
> 而不是本代码的行为；也可能只是愿景。在有人把它们追溯到具体机制之前，请视为
> 未经证实。更完整的对照表见 [`PROTOCOL.zh-CN.md`](PROTOCOL.zh-CN.md#此前记载于此的特性)。

- **配对码猜测**：每 IP 每分钟 5 次；全局每分钟 1000 次（任意 IP）
- **会话初始化**：每凭据每小时 60 次（防止失控循环）
- **WebSocket 连接**：每 IP 20 个并发

*（据称）*在 CF Worker 层通过 `env.RATE_LIMITER` 绑定（Cloudflare Rate Limiting API）强制执行。

## Phase 4 之前需审计的依赖

- `webrtc-rs`（主机 agent 的 WebRTC）—— 发布安装包前检查 CVE
- `@simplewebauthn/*` —— 由知名作者签名，维护活跃
- `scap` / `windows-capture` —— 屏幕捕获 crate；确认没有遥测
- 任何 Cloudflare Worker 依赖都必须锁定版本

## AGPL / 许可证影响

由于我们不再 fork RustDesk，就不再受 AGPL 约束。推荐：若偏好宽松复用则用 **Apache-2.0**，若偏好更简单则用 **MIT**。公开正式发布前须决定。
