/**
 * 简体中文文案（主机端界面）。
 *
 * 类型标注为 `Record<MessageKey, string>`，漏翻任何一个 key 都会在 `tsc`
 * 阶段报错，而不是悄悄回退成英文。
 *
 * 值里可用 `**粗体**`、`*斜体*` 和 `` `代码` `` 标记，由 `rich.tsx` 渲染。
 */

import type { MessageKey } from "./en";

export const zhCN: Record<MessageKey, string> = {
  // ---------- 主窗口 ----------
  "agent.hostName": "我的电脑",
  "agent.loading": "加载中…",
  "agent.reload": "重新加载",
  "agent.error.title": "出错了",

  "agent.idle.start": "开始监听",
  "agent.idle.hint":
    "接下来会让你选择共享哪块屏幕。之后受信设备随时可以重连 —— 每次都会先弹窗征求你的同意。",

  "agent.status.session": "会话 · {state}",
  "agent.status.listening.one": "监听中 · {n} 台受信设备",
  "agent.status.listening.many": "监听中 · {n} 台受信设备",

  "agent.trusted.title": "受信设备",
  "agent.action.revoke": "撤销",
  "agent.action.addDevice": "添加新设备",
  "agent.action.stopListening": "停止监听",
  "agent.action.settings": "设置",

  // ---------- 来电重连提示 ----------
  "agent.incoming.title": "有设备请求连接",
  "agent.incoming.body": "**{name}** 想要重新连接。",
  "agent.incoming.hint": "接下来会让你选择共享哪块屏幕或窗口。",
  "agent.action.accept": "接受",
  "agent.action.decline": "拒绝",

  // ---------- 系统通知 ----------
  "agent.notification.body": "{name} 正在尝试重连 —— 点击以接受。",
  "agent.trustedDevice": "一台受信设备",

  // ---------- 首次向导 / 设置 ----------
  "wizard.title": "设置",
  "wizard.help":
    "FreeRemoteDesk 运行在**你自己**的 Cloudflare 与 Vercel 免费额度账号上。先从 GitHub 仓库部署好你的实例，再把两个网址粘贴到这里。",
  "wizard.signaling.label": "信令地址（Signaling URL）",
  "wizard.signaling.placeholder":
    "https://freeremotedesk-signaling.your-name.workers.dev",
  "wizard.signaling.hint":
    "你的 Cloudflare Workers 地址。部署完 signaling 包后，在 Workers 控制台里可以找到。",
  "wizard.pwa.label": "PWA 地址",
  "wizard.pwa.optional": "（可选）",
  "wizard.pwa.placeholder": "https://myremotedesk.vercel.app",
  "wizard.pwa.hint": "你的 Vercel 部署地址。会作为提示显示在配对界面上。",
  "wizard.codeLen.label": "配对码长度",
  "wizard.codeLen.hint":
    "每个配对码的字符数（{min}–{max}）。越长越难被猜中；每台设备只需输入一次。每次配对都会重新生成一个新码。",
  "wizard.autostart": "登录系统时自动启动 FreeRemoteDesk",
  "wizard.action.save": "保存并继续",
  "wizard.action.saving": "保存中…",
  "wizard.status.testing": "正在检测信令地址…",
  "wizard.footer":
    "配置保存在你系统的应用数据目录中。之后随时可以在主机端的「设置」里修改。",
  "wizard.error.healthFailed": "健康检查失败：{reason}",
  "wizard.error.saveFailed": "保存失败：{reason}",
  "wizard.error.notSignaling": "这不是一个 FreeRemoteDesk 信令服务器（返回：{body}）",

  // ---------- 文件传输 ----------
  "file.action.send": "发送文件",
  "file.status.offered": "客户端正在发送 **{name}**（{size}）…",
  "file.status.sending": "正在发送 **{name}** —— {done} / {total}",
  "file.status.receiving": "正在接收 **{name}** —— {done} / {total}",
  "file.status.saved": "**{name}** 已保存到 {folder}",
  "file.status.sent": "**{name}** 已发送",
  "file.status.failed": "传输失败 —— {reason}",
  "file.reason.too_large": "文件超过本机设置的上限",
  "file.reason.busy": "已有另一个传输在进行中",
  "file.reason.io": "文件写入失败",
  "file.reason.cancelled": "对方取消了传输",
  "file.reason.interrupted": "连接中断",
  "file.reason.incomplete": "收到的字节数少于预期",
  "file.reason.unsupported": "对方不支持文件传输",
  "file.reason.protocol": "文件通道尚未就绪",
  "file.error.noChannel": "文件通道尚未就绪。",
  "file.notification.saved": "已接收 {name}",
  "file.notification.sent": "已发送 {name}",

  // ---------- 关于 ----------
  "about.title": "关于",
  "about.version": "Agent 版本 {version}",
  "about.versionUnknown": "版本未知",
  "about.fork":
    "本程序是 [Teylersf/freeremotedesk]({upstream}) 的修改版分支。本分支所有者与原项目所有者没有任何附属关系，双方均不对可用性做任何保障。",
  "about.ai":
    "本分支完全使用 AI（deepseek-v4.1-flash）修改，安全性同样不作保障（尽管未对具有安全性部分的主要代码有修改）。",
  "about.license": "原项目以 Apache-2.0 许可发布。",
  "about.upstream": "原项目",
  "about.thisFork": "本分支",
  "about.show": "关于此版本",

  // ---------- 语言切换 ----------
  "lang.label": "语言",
};
