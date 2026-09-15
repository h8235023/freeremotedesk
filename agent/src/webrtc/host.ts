/**
 * HostPeer — the agent-side WebRTC peer.
 *
 * Two operating modes:
 *
 *   1. `pair` mode: opens WS to /ws/{pairing_code}. First-time pair with a
 *      new client. The user has just clicked "Add a new device", so capture
 *      happens up-front (real user gesture). On WebRTC connect, the client
 *      can send a pair.save control message to register itself.
 *
 *   2. `persistent` mode: opens WS to /ws/host-{agent_id} without capturing
 *      the screen. Kept open across sessions.
 *      When a saved client sends `auth`, we verify the secret and fire
 *      `onIncomingAuth` — the UI shows a system notification + focuses the
 *      window + shows an "Accept?" prompt. When the user clicks Accept
 *      (a real user gesture), the UI calls `acceptIncoming()` which triggers
 *      captureScreen + WebRTC negotiation.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  decode,
  decodeControl,
  encode,
  encodeControl,
  type ControlMessage,
  type InputEvent,
  type PeerKind,
  type SignalMessage,
} from "../protocol";
import { FileTransfer, type TransferDone, type TransferProgress } from "./files";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export type HostPeerEvents = {
  onStateChange: (state: RTCIceConnectionState) => void;
  onInput: (evt: InputEvent) => void;
  onClose: (reason?: string) => void;
  onError: (err: Error) => void;
  /** Persistent mode: a session just ended, bus stays open. */
  onSessionEnded: () => void;
  /** Persistent mode: an incoming client authed. Parent should acceptIncoming(). */
  onIncomingAuth: (clientId: string) => void;
  /** A `pair.save` was accepted and the client is now in the trusted list. */
  onTrustedClientAdded: (name: string) => void;
  /** The dedicated file-transfer channel is open and usable. */
  onFilesOpen: () => void;
  onFileIncoming: (name: string, size: number) => void;
  onFileProgress: (p: TransferProgress) => void;
  onFileDone: (d: TransferDone) => void;
  onFileError: (reason: string, detail?: string) => void;
};

export type HostPeerMode = "pair" | "persistent";

export type HostPeerOptions = {
  code: string;
  signalingUrl: string;
  mode: HostPeerMode;
  hostId: string;
  hostName: string;
};

export function toWsUrl(userUrl: string): string {
  const trimmed = userUrl.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) return trimmed;
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice("https://".length)}`;
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice("http://".length)}`;
  return `wss://${trimmed}`;
}

export class HostPeer {
  readonly opts: HostPeerOptions;
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  /**
   * A second peer connection carrying only file transfer. Kept separate so a
   * large transfer can't starve the screen stream — under `max-bundle` the media
   * channels would otherwise share one transport and one congestion controller.
   */
  private filesPc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private filesChannel: RTCDataChannel | null = null;
  private handlers: Partial<HostPeerEvents> = {};
  private authedClientId: string | null = null;
  private closed = false;
  // Handlers are read through arrows so `onFiles()` can be called at any time.
  private files = new FileTransfer(() => this.filesChannel, {
    onIncoming: (name, size) => this.filesHandlers.onIncoming?.(name, size),
    onProgress: (p) => this.filesHandlers.onProgress?.(p),
    onDone: (d) => this.filesHandlers.onDone?.(d),
    onError: (reason, detail) => this.filesHandlers.onError?.(reason, detail),
  });

  constructor(opts: HostPeerOptions) {
    this.opts = opts;
  }

  /** Wire the file-transfer callbacks. Kept separate from `on()` so the UI can
   *  pass a single object instead of five separate registrations. */
  onFiles(handlers: {
    onOpen?: () => void;
    onIncoming?: (name: string, size: number) => void;
    onProgress?: (p: TransferProgress) => void;
    onDone?: (d: TransferDone) => void;
    onError?: (reason: string, detail?: string) => void;
  }): void {
    this.filesHandlers = handlers;
  }

  private filesHandlers: {
    onOpen?: () => void;
    onIncoming?: (name: string, size: number) => void;
    onProgress?: (p: TransferProgress) => void;
    onDone?: (d: TransferDone) => void;
    onError?: (reason: string, detail?: string) => void;
  } = {};

  /** True once the file channel can carry data. */
  filesReady(): boolean {
    return this.filesChannel?.readyState === "open";
  }

  /** Push a file to the connected client. */
  sendFile(file: File): Promise<void> {
    return this.files.sendFile(file);
  }

  on<E extends keyof HostPeerEvents>(event: E, handler: HostPeerEvents[E]) {
    this.handlers[event] = handler;
  }

  /** Prompt user for a screen and start capture. Call before connect() in pair mode. */
  async captureScreen(): Promise<void> {
    if (this.stream) return; // already captured
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
    });
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener("ended", () => this.close("user stopped sharing"));
    }
  }

  /** Open the WebSocket. In persistent mode, stays open across sessions. */
  async connect(): Promise<void> {
    if (this.closed) throw new Error("host closed");
    const url = `${toWsUrl(this.opts.signalingUrl)}/ws/${encodeURIComponent(this.opts.code)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        ws.removeEventListener("open", onOpen);
        reject(new Error(`signaling ws failed at ${url}`));
      };
      ws.addEventListener("open", onOpen, { once: true });
      ws.addEventListener("error", onError, { once: true });
    });

    ws.addEventListener("message", (evt) => {
      const msg = decode(typeof evt.data === "string" ? evt.data : "");
      if (msg) void this.onSignal(msg);
    });
    ws.addEventListener("close", () => {
      if (!this.closed) this.handlers.onClose?.("signaling ws closed");
    });
  }

  /**
   * Persistent mode only. Called from a user-gesture click handler AFTER
   * onIncomingAuth fires. Captures the screen, sends auth.ok, and starts
   * WebRTC negotiation.
   */
  async acceptIncoming(): Promise<void> {
    if (this.opts.mode !== "persistent") {
      throw new Error("acceptIncoming only valid in persistent mode");
    }
    if (!this.authedClientId) {
      throw new Error("no pending authed client");
    }
    await this.captureScreen();          // user gesture required — this is the click
    this.sendSignal({ t: "auth.ok" });
    await this.startWebRtc();
    await this.sendOffer("media");
    await this.sendOffer("files");
  }

  /** Persistent mode: reject a pending incoming auth (user declined). */
  rejectIncoming(reason = "denied by host"): void {
    if (this.authedClientId) {
      this.sendSignal({ t: "auth.fail", reason });
      this.authedClientId = null;
    }
  }

  private async onSignal(msg: SignalMessage): Promise<void> {
    try {
      switch (msg.t) {
        case "welcome":
          if (msg.peerId !== "host") throw new Error(`unexpected role: ${msg.peerId}`);
          break;

        case "ready":
          if (this.opts.mode === "pair") {
            // Pair mode: no auth needed, capture already done, start negotiation.
            // Media first so the screen appears before the file channel finishes
            // negotiating — the two offers share one WebSocket.
            await this.startWebRtc();
            await this.sendOffer("media");
            await this.sendOffer("files");
          }
          // Persistent mode: wait for auth message from the client.
          break;

        case "auth":
          if (this.opts.mode !== "persistent") {
            this.sendSignal({ t: "auth.fail", reason: "not accepting auth in this mode" });
            return;
          }
          const ok = await invoke<boolean>("verify_trusted_client", {
            clientId: msg.clientId,
            secret: msg.secret,
          });
          if (ok) {
            this.authedClientId = msg.clientId;
            // Do NOT reply auth.ok yet — wait for user gesture. Fire event.
            this.handlers.onIncomingAuth?.(msg.clientId);
          } else {
            this.sendSignal({ t: "auth.fail", reason: "unknown or invalid credential" });
          }
          break;

        case "sdp": {
          const pc = this.pcFor(msg.pc);
          if (!pc) return;
          if (msg.kind !== "answer") return;
          await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          break;
        }

        case "ice": {
          const pc = this.pcFor(msg.pc);
          if (!pc || !msg.candidate) return;
          try { await pc.addIceCandidate(msg.candidate); }
          catch (e) { console.warn("addIceCandidate failed", e); }
          break;
        }

        case "peer-gone":
          this.teardownSession("client left");
          if (this.opts.mode === "pair") {
            this.close("client left");
          } else {
            this.handlers.onSessionEnded?.();
          }
          break;
      }
    } catch (err) {
      this.handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async startWebRtc(): Promise<void> {
    this.teardownSession("resetting");

    this.pc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
      bundlePolicy: "max-bundle",
    });

    this.inputChannel = this.pc.createDataChannel("input", { ordered: true });
    this.inputChannel.addEventListener("message", (evt) => {
      try {
        const parsed = JSON.parse(typeof evt.data === "string" ? evt.data : "") as InputEvent;
        this.handlers.onInput?.(parsed);
      } catch { /* ignore */ }
    });

    this.controlChannel = this.pc.createDataChannel("control", { ordered: true });
    this.controlChannel.addEventListener("message", (evt) => {
      const msg = decodeControl(typeof evt.data === "string" ? evt.data : "");
      if (msg) void this.onControl(msg);
    });

    this.pc.addEventListener("icecandidate", (evt) => {
      this.sendSignal({
        t: "ice",
        pc: "media",
        candidate: evt.candidate ? evt.candidate.toJSON() : null,
      });
    });
    this.pc.addEventListener("iceconnectionstatechange", () => {
      const s = this.pc?.iceConnectionState;
      if (s) this.handlers.onStateChange?.(s);
    });

    // Should have captured by now (pair mode: before connect; persistent mode: in acceptIncoming).
    if (!this.stream) throw new Error("no captured stream — capture before startWebRtc");
    for (const track of this.stream.getTracks()) {
      this.pc.addTrack(track, this.stream);
    }

    this.startFilesPeer();
  }

  /**
   * Data-only peer connection for file transfer. No tracks, so nothing here can
   * contend with the captured screen for the media connection's bandwidth.
   */
  private startFilesPeer(): void {
    this.files.reset();
    this.filesPc = new RTCPeerConnection({
      iceServers: DEFAULT_ICE_SERVERS,
      bundlePolicy: "max-bundle",
    });

    this.filesChannel = this.filesPc.createDataChannel("files", { ordered: true });
    // Default is "blob", which would force an async copy per chunk.
    this.filesChannel.binaryType = "arraybuffer";
    this.filesChannel.addEventListener("message", (evt) => {
      if (typeof evt.data === "string") {
        this.files.handleText(evt.data);
      } else if (evt.data instanceof ArrayBuffer) {
        this.files.handleBinary(evt.data);
      }
    });
    this.filesChannel.addEventListener("open", () => this.filesHandlers.onOpen?.());
    this.filesChannel.addEventListener("close", () =>
      this.files.abort("interrupted"),
    );

    this.filesPc.addEventListener("icecandidate", (evt) => {
      this.sendSignal({
        t: "ice",
        pc: "files",
        candidate: evt.candidate ? evt.candidate.toJSON() : null,
      });
    });
  }

  private async sendOffer(kind: PeerKind): Promise<void> {
    const pc = this.pcFor(kind);
    if (!pc) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (offer.sdp) this.sendSignal({ t: "sdp", pc: kind, kind: "offer", sdp: offer.sdp });
  }

  private async onControl(msg: ControlMessage): Promise<void> {
    if (msg.t !== "pair.save") return;
    try {
      await invoke("store_trusted_client", {
        clientId: msg.clientId,
        name: msg.deviceName,
        secret: msg.secret,
      });
      this.sendControl({
        t: "pair.save.ok",
        hostId: this.opts.hostId,
        hostName: this.opts.hostName,
      });
      // The config on disk just changed; let the window re-read the list rather
      // than waiting for the pair session to close.
      this.handlers.onTrustedClientAdded?.(msg.deviceName);
    } catch (err) {
      this.sendControl({
        t: "pair.save.fail",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Which peer connection a negotiation message belongs to. */
  private pcFor(kind?: PeerKind): RTCPeerConnection | null {
    return kind === "files" ? this.filesPc : this.pc;
  }

  private sendSignal(msg: SignalMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encode(msg));
  }

  private sendControl(msg: ControlMessage) {
    const ch = this.controlChannel;
    if (!ch || ch.readyState !== "open") return;
    ch.send(encodeControl(msg));
  }

  private teardownSession(_reason: string) {
    // Tell the Rust side to drop any half-written file before the channel goes.
    this.files.abort("interrupted");
    try { this.inputChannel?.close(); } catch { /* ignore */ }
    try { this.controlChannel?.close(); } catch { /* ignore */ }
    try { this.filesChannel?.close(); } catch { /* ignore */ }
    try { this.pc?.close(); } catch { /* ignore */ }
    try { this.filesPc?.close(); } catch { /* ignore */ }
    this.inputChannel = null;
    this.controlChannel = null;
    this.filesChannel = null;
    this.pc = null;
    this.filesPc = null;
    this.authedClientId = null;
  }

  close(reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    this.teardownSession(reason ?? "closed");
    this.stream = null;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.handlers.onClose?.(reason);
  }
}
