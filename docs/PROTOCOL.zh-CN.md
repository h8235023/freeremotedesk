# 线路协议

> [English](PROTOCOL.md) · **简体中文**

## 信令消息（基于 WebSocket 的 JSON）

所有消息都是 JSON 信封：`{ "t": "<type>", ...fields }`。

### 客户端 → 信令服务

| `t` | 字段 | 时机 |
|---|---|---|
| `pair.new` | `{ agentPubKey }` | 主机端代理向服务器请求一个新的配对码 |
| `pair.claim` | `{ code }` | PWA 客户端提交配对码以认领一台主机 |
| `session.init` | `{ hostId, assertion }`（WebAuthn） | 已配对的客户端发起新会话 |
| `sdp.offer` | `{ peerId, sdp }` | 发往对端的 WebRTC offer |
| `sdp.answer` | `{ peerId, sdp }` | 发往对端的 WebRTC answer |
| `ice` | `{ peerId, candidate }` | 发往对端的 trickle ICE candidate |
| `pong` | `{}` | 保活响应 |

### 信令服务 → 客户端

| `t` | 字段 | 含义 |
|---|---|---|
| `pair.code` | `{ code, expiresAt }` | 对 `pair.new` 的回复 |
| `pair.claimed` | `{ peerId }` | 告知主机：已有客户端认领了该配对码 |
| `session.ready` | `{ peerId }` | 对端已在线，可以开始 WebRTC 协商 |
| `sdp.offer` / `sdp.answer` / `ice` | （转发自对端） | 原样转发，内容由 DTLS-SRTP 加密 |
| `error` | `{ code, message }` | 出错了 |
| `ping` | `{}` | 保活 |

每 25 秒收发一次 ping/pong，以熬过负载均衡器的空闲超时。

## 配对码格式

- 由主机端代理在本地生成（`agent/src-tauri/src/pairing.rs`）。信令服务从不生成
  或校验配对码——它只把配对码当作 Durable Object 的房间键使用。
- 长度可由用户配置：6–128 个字符，默认 16。下限沿用了原先的固定长度；上限取自
  Worker 的房间键检查（`roomKey.length > 128` → 400）。
- 字符集为 `23456789abcdefghjkmnpqrstuvwxyz`（31 个字符，剔除了 0/1/i/l/o 以便
  辨认），因此 16 个字符约等于 79 比特。
- 每次配对尝试都会生成一个新配对码，并在配对连接关闭时丢弃。
- 配对码*就是*房间键：两个对端可以加入 `/ws/{code}`，第三个会被拒绝，因为房间
  最多只允许两条连接。

### 此前记载于此的特性

本节过去将以下内容作为保证来陈述。这些内容被**保留在原文中而非删除**，但在本
仓库中未找到它们的任何实现。它们可能描述的是底层平台（Cloudflare 边缘节点 /
Durable Objects，或浏览器）提供的行为，也可能只是愿景——在有人把它们追溯到具
体机制之前，请将其视为未经证实。

| 说法 | 代码中实际的情况 |
|---|---|
| “约 30 比特熵——足以抵御在线暴力破解（服务器按 IP 限流至每分钟 5 次尝试）” | **部分已被取代。** 现在 `/ws/` 上有限流，但数字不同且只是尽力而为：每 IP 每分钟 30 次、全局每分钟 600 次，保存在 isolate 内存中（`signaling/src/index.ts`）。让短码安全的并不是它 —— 而是默认的 16 位（约 79 bit）。见 [速率限制](SECURITY.zh-CN.md#速率限制)。 |
| “生成后 60 秒内有效” | 任何地方都没有设置或强制执行 TTL。房间的生命周期与其对端连接一样长。 |
| “一次性：客户端认领的那一刻即被消耗” | 没有任何东西被消耗或失效。第三个对端被拒绝，仅仅是因为房间最多允许两条连接——而不是因为配对码已作废。 |

由于上述各项均未在代码中强制执行，目前配对码的熵就是房间与不速之客之间的唯一
屏障。请尽量使用更长的配对码。

## WebRTC 通道布局

| 轨道 / 通道 | 用途 | 优先级 |
|---|---|---|
| `video`（RTP） | 屏幕帧 | 高 |
| `audio`（RTP，可选） | 主机音频 | 中 |
| `input`（DataChannel，有序+可靠） | 鼠标/键盘事件 | 高 |
| `control`（DataChannel，有序+可靠） | 光标样式、显示器列表、分辨率变更 | 中 |
| `clipboard`（DataChannel，有序+可靠） | 剪贴板同步（第 4 阶段及以后） | 低 |
| `files`（DataChannel，有序+可靠） | 文件传输分片 | 低 |

`files` 通道**不在**与其他通道相同的那条 `RTCPeerConnection` 上，而是跑在第二条纯数据
连接上 —— 这样大文件传输就不会抢占画面流的带宽。因为在 `max-bundle` 下，媒体各通道共用
一条传输和一个拥塞控制器，批量数据否则会与视频争抢。两条连接都通过同一条信令 WebSocket
协商，这就是 `sdp` 和 `ice` 需要带一个 `pc` 字段的原因（缺省即 `"media"`）。信令中继
逐字转发，无需理解它。

### 文件传输消息（走 `files` 通道）

字符串是控制消息，二进制就是文件字节。通道有序且可靠，所以 `file.eof` 不可能越过它之前
的字节 —— 因此**没有长度前缀，也没有序号**。完整性由声明的文件大小，加上主机边写盘边计算
的 SHA-256 来保证。

| `t` | 字段 | 方向 |
|---|---|---|
| `file.offer` | `{ name, size, mime? }` | 发送方 → 接收方 |
| `file.accept` | `{ name }` —— 净化并去重后实际使用的文件名 | 接收方 → 发送方 |
| `file.reject` | `{ reason, detail? }` | 接收方 → 发送方 |
| `file.eof` | `{}` | 发送方 → 接收方 |
| `file.done` | `{ name, path, bytes, sha256 }` | 接收方 → 发送方 |
| `file.fail` | `{ reason, detail? }` | 双向 |
| `file.cancel` | `{}` | 双向 |

`reason` 一律是短错误码（`too_large`、`busy`、`io`、`cancelled`、`interrupted`、
`incomplete`、`unsupported`、`protocol`），便于对端翻译；`detail` 是未翻译的诊断文本。

分片固定 **16 KiB**，不做协商 —— 这是最坏情况（Safari 的 256 KiB）的四分之一。发送侧按
`bufferedAmount` 门控（高水位 4 MiB，低水位 1 MiB），接收侧串行写入，因此无论文件多大，
在途内存都是有界的。

主机收到的文件落在 `下载/FreeRemoteDesk/`，先写入 `.frd-part-*` 临时文件，`fsync` 之后
才改名到位 —— 所以传输中断绝不会留下一个看起来完整、实际被截断的文件。

## 输入事件 schema（DataChannel）

紧凑的二进制或 JSON——MVP 阶段偏向使用 JSON 以求简单，若受带宽制约再切换到二进制。

```
{ "t": "m", "x": 512, "y": 384 }              // mouse move (screen coords)
{ "t": "mb", "b": 0, "d": true }              // mouse button (0=left,1=middle,2=right; d=down)
{ "t": "w", "dx": 0, "dy": -120 }             // wheel
{ "t": "k", "code": "KeyA", "d": true }       // key event; codes = KeyboardEvent.code strings
{ "t": "tap", "x": 512, "y": 384 }            // touch tap (mobile PWA)
```

服务器通过 `control` 通道回传控制帧：
```
{ "t": "cursor", "kind": "text" }             // cursor style change
{ "t": "monitors", "list": [{id, w, h}] }    // monitor enumeration
{ "t": "resize", "w": 1920, "h": 1080 }       // active monitor resolution
```
