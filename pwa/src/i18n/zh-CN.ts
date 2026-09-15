/**
 * 简体中文文案。
 *
 * 类型标注为 `Record<MessageKey, string>`，因此漏翻任何一个 key 都会在
 * `tsc` 阶段直接报错，而不是悄悄回退成英文。
 *
 * 值里可用 `**粗体**`、`*斜体*` 和 `` `代码` `` 标记，由 `rich.tsx` 渲染。
 */

import type { MessageKey } from "./en";

export const zhCN: Record<MessageKey, string> = {
  // ---------- 落地页（访问 / 时看到）----------
  "landing.hero.line1": "你的家用开发机，",
  "landing.hero.line2": "任何浏览器都能连。",
  "landing.hero.free": "永久免费。",
  "landing.subhead":
    "一个远程桌面 PWA + 主机端代理，完全跑在你自己的 Cloudflare 与 Vercel 免费额度账号上。没有我们控制的服务器，没有月费账单，也不用注册账号。",
  "landing.cta.open": "打开客户端 →",
  "landing.cta.deploy": "在 GitHub 上部署你自己的",

  "landing.why.title": "有何不同",
  "landing.f1.title": "中间没有人",
  "landing.f1.body":
    "画面与输入数据全程走 WebRTC 点对点直连。你自己 Cloudflare 账号上的信令 Worker 只能看到加密的握手字节。",
  "landing.f2.title": "永久 $0",
  "landing.f2.body":
    "Cloudflare Workers + Vercel 的免费额度对个人远程桌面使用绰绰有余。没有试用期，不催你升级，也不需要信用卡。",
  "landing.f3.title": "是 PWA，不用去应用商店装",
  "landing.f3.body":
    "任意浏览器打开，添加到主屏幕，像原生应用一样启动。iOS、Android、笔记本 —— 到哪都是同一个客户端。",
  "landing.f4.title": "整条技术栈都归你",
  "landing.f4.body":
    "你的 Cloudflare 账号、你的 Vercel 部署、你的安装包。Fork 仓库，随便改，部署你自己的版本。",
  "landing.f5.title": "一键重连",
  "landing.f5.body":
    "用配对码配一次，之后设备就会出现在列表里。点一下即可重连 —— 类似生物识别的信任机制，不用再输配对码。",
  "landing.f6.title": "为「氛围编程」而生",
  "landing.f6.body":
    "安装文档就是写给 AI 代理看的。把仓库丢给 Claude 或 Cursor，它会把整套东西部署好，你可以先去喝杯咖啡。",

  "landing.setup.title": "三步完成部署",
  "landing.step1":
    "**把仓库交给你的 AI**（Claude、Cursor、Aider、Codex —— 任何带终端的 AI 编程工具）。告诉它：*「帮我装好 FreeRemoteDesk，读 AGENTS.md 并照着做。」*",
  "landing.step2":
    "在它提示时完成**三次命令行登录** —— GitHub、Cloudflare、Vercel。每次只需在浏览器点一下。",
  "landing.step3":
    "运行你的 AI 为你的系统下载的**安装包**。把它给你的两个网址粘贴进向导即可。",
  "landing.stepsFoot.prefix": "更想点按钮？",
  "landing.stepsFoot.link": "GitHub README",
  "landing.stepsFoot.after":
    " 里也有「Deploy to Cloudflare」和「Deploy to Vercel」一键部署按钮。",

  "landing.how.title": "工作原理",
  "landing.how.p1":
    "**主机端代理**是一个小巧的 Tauri 应用，运行在你想连接的机器上。它用浏览器引擎内置的 `getDisplayMedia` 抓取屏幕，再用标准的 **WebRTC** 推流 —— 就是 Zoom 和 Google Meet 用的那套技术 —— 所有流量经 DTLS-SRTP 端到端加密。",
  "landing.how.p2":
    "**PWA 客户端**可在任何现代浏览器中打开，在手机上能装到主屏幕，然后与主机直连 —— 信令 Worker 只能看到少量握手消息，永远看不到你的画面和输入。",
  "landing.how.p3":
    "你 Cloudflare 账号上的**信令 Worker** 为每个会话分配一个 Durable Object 来转发握手。免费额度约可支撑每天 1 万个会话；个人使用永远碰不到上限。",

  "landing.trust.title": "受信设备重连",
  "landing.trust.body":
    "用一次性配对码把你的手机或笔记本配一次。之后它就会出现在「已配对主机」列表里 —— 点一下即可重连，无需配对码。凭据不会离开这两台设备，信令服务器无法冒充你。",

  "landing.footer.note": "源码可查阅，上游许可尚未确定 —— ",
  "landing.footer.client": "打开客户端",
  "landing.footer.download": "下载主机端",
  "landing.footer.agents": "给 AI 代理看",

  // ---------- 连接页 ----------
  "connect.subtitle.saved": "点一下已配对的主机即可重连，或添加一个新的。",
  "connect.subtitle.empty": "请输入主机上显示的配对码。",
  "connect.pairNew": "配对新主机",
  "connect.placeholder": "配对码",
  "connect.action.connect": "连接",
  "connect.action.connecting": "连接中…",
  "connect.changeServer": "更换信令服务器",
  "connect.status.connectingTo": "正在连接 {name}…",
  "connect.status.authFailed": "{name} 认证失败",
  "connect.status.failed": "连接失败",

  // ---------- 已配对主机列表 ----------
  "savedHosts.title": "已配对的主机",
  "savedHosts.reconnectTo": "重连到 {name}",
  "savedHosts.lastUsed": "上次使用：{age}",
  "savedHosts.notConnected": "尚未连接过",
  "savedHosts.forgetConfirm": "要忘记「{name}」吗？之后需要重新用配对码配对。",
  "savedHosts.forgetTitle": "忘记此主机",
  "savedHosts.age.now": "刚刚",
  "savedHosts.age.minutes": "{n} 分钟前",
  "savedHosts.age.hours": "{n} 小时前",
  "savedHosts.age.days": "{n} 天前",

  // ---------- 配对成功后的保存弹窗 ----------
  "save.title": "保存此主机？",
  "save.help":
    "下次打开 PWA 时，这台主机会出现在列表里 —— 点一下即可重连，无需配对码。",
  "save.wait.connecting":
    "正在连接主机…（ICE：{state}）。控制通道就绪后「保存」才会解锁。",
  "save.wait.failed":
    "无法连接到主机（ICE：{state}）。如果用手机，这通常是 NAT 穿透失败 —— 换个网络试试，或关掉 VPN / Zero Trust 客户端。",
  "save.deviceName": "设备名称（方便你自己辨认）",
  "save.deviceNamePlaceholder": "例如：我的 iPhone",
  "save.action.save": "保存",
  "save.action.notNow": "暂不",
  "save.saving": "保存中…",
  "save.success.title": "✅ 已保存",
  "save.success.help": "**{name}** 已加入你的「已配对主机」列表，随时可以重连。",
  "save.success.recommend":
    "**可选但推荐：** 把这个网址加进书签。如果浏览器哪天清空了存储，打开书签即可恢复访问 —— 不用重新配对。",
  "save.action.copy": "复制",
  "save.action.copied": "已复制 ✓",
  "save.warning": "任何拿到这个网址的人都能访问，请妥善保管。",
  "save.action.done": "完成",
  "save.error.title": "出了点问题",
  "save.action.tryAgain": "重试",
  "save.action.close": "关闭",
  "save.error.controlChannel": "控制通道尚未就绪 —— 请稍等片刻再试。",
  "save.error.timeout": "主机 5 秒内没有响应",
  "save.error.rejected": "主机拒绝了保存请求",

  // ---------- 信令配置页 ----------
  "setup.subtitle": "首次配置。请粘贴你的信令 Worker 地址。",
  "setup.placeholder": "https://freeremotedesk-signaling.you.workers.dev",
  "setup.action.testing": "检测中…",
  "setup.action.continue": "继续",
  "setup.footer":
    "还没有？在 FreeRemoteDesk 的 GitHub 仓库点一下「Deploy to Cloudflare」，几分钟就能起一个属于你的信令 Worker。",
  "setup.error.healthCheck": "健康检查失败",
  "setup.error.serverReturned": "服务器返回 {status}",
  "setup.error.notSignaling": "这不是一个 FreeRemoteDesk 信令服务器",

  // ---------- 会话工具栏 ----------
  "toolbar.showKeyboard": "显示键盘",
  "toolbar.endSession": "结束会话",

  // ---------- 文件传输 ----------
  "file.button": "文件",
  "file.title": "文件传输",
  "file.action.send": "发送文件到主机",
  "file.action.close": "关闭",
  "file.action.fullscreen": "全屏",
  "file.waiting": "正在准备文件通道…",
  "file.unsupported": "主机运行的版本不支持文件传输，因此该功能不可用。",
  "file.empty": "还没有传输记录。",
  "file.status.sending": "发送中 —— {done} / {total}",
  "file.status.receiving": "接收中 —— {done} / {total}",
  "file.status.downloaded": "已下载",
  "file.status.sent": "已发送",
  "file.status.failed": "失败 —— {reason}",
  "file.hint.slow": "文件传输与画面共用同一条连接，传输期间画面可能会卡顿。",
  "file.reason.too_large": "文件超过主机设置的上限",
  "file.reason.busy": "已有另一个传输在进行中",
  "file.reason.io": "主机无法写入文件",
  "file.reason.cancelled": "传输已被取消",
  "file.reason.interrupted": "连接中断",
  "file.reason.incomplete": "收到的字节数少于预期",
  "file.reason.unsupported": "主机不支持文件传输",
  "file.reason.protocol": "文件通道尚未就绪",

  // ---------- 自动生成的设备名 ----------
  "device.android": "Android 设备",
  "device.windows": "Windows 电脑",
  "device.linux": "Linux 设备",
  "device.browser": "浏览器",

  // ---------- 关于 ----------
  "landing.footer.repo": "本分支仓库",

  "about.title": "关于",
  "about.show": "关于此版本",
  "about.version": "PWA 版本 {version}",
  "about.fork":
    "本程序是 [Teylersf/freeremotedesk]({upstream}) 的修改版分支。本分支所有者与原项目所有者没有任何附属关系，双方均不对可用性做任何保障。",
  "about.ai":
    "本分支完全使用 AI（deepseek-v4.1-flash）修改，安全性同样不作保障（尽管未对具有安全性部分的主要代码有修改）。",
  "about.license":
    "许可：**并未授予，且上游描述不清。** 原项目没有 LICENSE 文件、未声明 `license` 字段，只把 Apache-2.0 标为「待定」。没有许可即默认保留所有权利 —— 本分支继承这一状态，也无法授予自己并不持有的权利。",
  "about.upstream": "原项目",
  "about.thisFork": "本分支",

  // ---------- 语言切换 ----------
  "lang.label": "语言",
};
