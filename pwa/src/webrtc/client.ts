/**
 * PeerClient — the PWA-side WebRTC peer (the "viewer").
 *
 * Two flows:
 *
 *   1. Pairing (code URL): user types the host's pairing code, PWA opens /ws/{code}.
 *      Host is on the other end, no auth required, WebRTC starts immediately
 *      on "ready". After it connects, PWA can offer "save this host?" and
 *      exchange trusted-device credentials on the "control" DataChannel.
 *
 *   2. Reconnect (host URL): PWA opens /ws/host-{hostId} using saved
 *      credentials. Before WebRTC starts, PWA sends `auth` on the signaling
 *      WebSocket. Host verifies, replies auth.ok / auth.fail. On ok, WebRTC
 *      negotiation proceeds normally.
 */

import { toWsUrl } from "../config";
import {
  decode,
  decodeControl,
  encode,
  encodeControl,
  type ControlMessage,
  type PeerKind,
  type SignalMessage,
} from "./protocol";
import { FileTransfer, type TransferDone, type TransferProgress } from "./files";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export type PeerClientEvents = {
  onTrack: (stream: MediaStream) => void;
  onDataChannel: (label: string, channel: RTCDataChannel) => void;
  onControlMessage: (msg: ControlMessage) => void;
  /** Fires once the host's "control" DataChannel is open and can carry sends. */
  onControlOpen: () => void;
  onStateChange: (state: RTCIceConnectionState) => void;
  onClose: (reason?: string) => void;
  onError: (err: Error) => void;
  onAuthResult: (ok: boolean, reason?: string) => void;
  /** The dedicated file-transfer channel is open and usable. */
  onFilesOpen: () => void;
  onFileIncoming: (name: string, size: number) => void;
  onFileProgress: (p: TransferProgress) => void;
  onFileDone: (d: TransferDone) => void;
  onFileError: (reason: string, detail?: string) => void;
};

export type PeerClientOptions = {
  /** URL param — pairing code, or `host-{agent_id}` for reconnect. */
  code: string;
  signalingUrl: string;
  /** If provided, PWA will send this as `auth` before starting WebRTC. */
  auth?: { clientId: string; secret: string };
};

export class PeerClient {
  readonly opts: PeerClientOptions;
  private pc: RTCPeerConnection;
  /**
   * A second peer connection carrying only file transfer. Kept separate so a
   * large transfer can't starve the screen stream — under `max-bundle` the media
   * channels would otherwise share one transport and one congestion controller.
   * Both are negotiated over the single signaling WebSocket.
   */
  private filesPc: RTCPeerConnection;
  private ws: WebSocket | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private filesChannel: RTCDataChannel | null = null;
  /**
   * Listeners per event. Deliberately a list rather than a single slot: two
   * components subscribe to the same event at once (SessionView and SavePrompt
   * both need `onStateChange`), and a single slot would let whichever mounted
   * last silently starve the other.
   */
  private listeners: { [E in keyof PeerClientEvents]?: Array<PeerClientEvents[E]> } = {};
  private remoteStream: MediaStream | null = null;
  private closed = false;
  private files = new FileTransfer(() => this.filesChannel, {
    onIncoming: (name, size) => this.emit("onFileIncoming", name, size),
    onProgress: (p) => this.emit("onFileProgress", p),
    onDone: (d) => this.emit("onFileDone", d),
    onError: (reason, detail) => this.emit("onFileError", reason, detail),
  });

  constructor(opts: PeerClientOptions) {
    this.opts = opts;
    const iceServers = DEFAULT_ICE_SERVERS;

    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.filesPc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });

    this.pc.addEventListener("track", (evt) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.emit("onTrack", this.remoteStream);
      }
      this.remoteStream.addTrack(evt.track);
    });

    this.pc.addEventListener("datachannel", (evt) => this.onDataChannel(evt.channel));
    this.filesPc.addEventListener("datachannel", (evt) => this.onDataChannel(evt.channel));

    this.pc.addEventListener("icecandidate", (evt) => {
      this.sendSignal({
        t: "ice",
        pc: "media",
        candidate: evt.candidate ? evt.candidate.toJSON() : null,
      });
    });
    this.filesPc.addEventListener("icecandidate", (evt) => {
      this.sendSignal({
        t: "ice",
        pc: "files",
        candidate: evt.candidate ? evt.candidate.toJSON() : null,
      });
    });

    // Only the media connection drives the session UI. A file-channel failure
    // must not tear down the screen — that separation is the whole point of
    // running file transfer on its own connection.
    this.pc.addEventListener("iceconnectionstatechange", () => {
      this.emit("onStateChange", this.pc.iceConnectionState);
      if (["failed", "closed"].includes(this.pc.iceConnectionState)) {
        this.emit("onClose", this.pc.iceConnectionState);
      }
    });
    this.filesPc.addEventListener("iceconnectionstatechange", () => {
      if (["failed", "closed"].includes(this.filesPc.iceConnectionState)) {
        this.files.abort("interrupted");
      }
    });
  }

  private onDataChannel(ch: RTCDataChannel) {
    if (ch.label === "control") {
      this.controlChannel = ch;
      ch.addEventListener("message", (mEvt) => {
        const msg = decodeControl(typeof mEvt.data === "string" ? mEvt.data : "");
        if (msg) this.emit("onControlMessage", msg);
      });
      // The channel is announced well before it can carry anything. Anything
      // that needs to *send* has to wait for open, so surface the transition
      // instead of leaving callers to discover it via `sendControl`'s false.
      if (ch.readyState === "open") this.emit("onControlOpen");
      else ch.addEventListener("open", () => this.emit("onControlOpen"));
    } else if (ch.label === "files") {
      this.filesChannel = ch;
      // Default is "blob", which would force an async copy per chunk.
      ch.binaryType = "arraybuffer";
      ch.addEventListener("message", (mEvt) => {
        if (typeof mEvt.data === "string") this.files.handleText(mEvt.data);
        else if (mEvt.data instanceof ArrayBuffer) this.files.handleBinary(mEvt.data);
      });
      ch.addEventListener("close", () => this.files.abort("interrupted"));
      if (ch.readyState === "open") this.emit("onFilesOpen");
      else ch.addEventListener("open", () => this.emit("onFilesOpen"));
    }
    this.emit("onDataChannel", ch.label, ch);
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<E extends keyof PeerClientEvents>(event: E, handler: PeerClientEvents[E]): () => void {
    const list: Array<PeerClientEvents[E]> = this.listeners[event] ?? [];
    list.push(handler);
    // The mapped type can't express "the array stored under exactly this key",
    // so the write goes through a wider view. The signature above is what
    // actually pairs an event name with its handler type.
    (this.listeners as Record<string, Array<PeerClientEvents[E]>>)[event as string] = list;
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<E extends keyof PeerClientEvents>(
    event: E,
    ...args: Parameters<PeerClientEvents[E]>
  ) {
    const list = this.listeners[event] as unknown as
      | Array<(...a: Parameters<PeerClientEvents[E]>) => void>
      | undefined;
    list?.forEach((h) => h(...args));
  }

  async connect(): Promise<void> {
    if (this.closed) throw new Error("client closed");
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
      if (!this.closed) this.emit("onClose", "signaling ws closed");
    });
  }

  /**
   * True once the host's "control" DataChannel is open. Callers that mount after
   * the connection is already up need this, since `onControlOpen` has by then
   * already fired.
   */
  isControlOpen(): boolean {
    return this.controlChannel?.readyState === "open";
  }

  /** True once the file-transfer channel can carry data. */
  isFilesOpen(): boolean {
    return this.filesChannel?.readyState === "open";
  }

  /** Push a file to the host. Rejects with a reason code if it refuses. */
  sendFile(file: File): Promise<void> {
    return this.files.sendFile(file);
  }

  private pcFor(kind?: PeerKind): RTCPeerConnection {
    return kind === "files" ? this.filesPc : this.pc;
  }

  /** Send a control-channel message (e.g., pair.save). Requires control channel to be open. */
  sendControl(msg: ControlMessage): boolean {
    const ch = this.controlChannel;
    if (!ch || ch.readyState !== "open") return false;
    ch.send(encodeControl(msg));
    return true;
  }

  private async onSignal(msg: SignalMessage): Promise<void> {
    try {
      switch (msg.t) {
        case "welcome":
          if (msg.peerId !== "client") throw new Error(`unexpected role: ${msg.peerId}`);
          break;

        case "ready":
          // Host is present. If we have credentials (reconnect flow), send auth now.
          // Otherwise (pair flow), the host will start negotiation and we just wait
          // for the offer.
          if (this.opts.auth) {
            this.sendSignal({
              t: "auth",
              clientId: this.opts.auth.clientId,
              secret: this.opts.auth.secret,
            });
          }
          break;

        case "auth.ok":
          this.emit("onAuthResult", true);
          break;

        case "auth.fail":
          this.emit("onAuthResult", false, msg.reason);
          this.emit("onError", new Error(msg.reason ?? "authentication failed"));
          this.close();
          break;

        case "sdp": {
          if (msg.kind !== "offer") return;
          const pc = this.pcFor(msg.pc);
          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (answer.sdp) this.sendSignal({ t: "sdp", pc: msg.pc, kind: "answer", sdp: answer.sdp });
          break;
        }

        case "ice": {
          if (msg.candidate) {
            try {
              await this.pcFor(msg.pc).addIceCandidate(msg.candidate);
            } catch (e) {
              console.warn("addIceCandidate failed", e);
            }
          }
          break;
        }

        case "peer-gone":
          this.emit("onClose", "host left");
          this.close();
          break;
      }
    } catch (err) {
      this.emit("onError", err instanceof Error ? err : new Error(String(err)));
    }
  }

  private sendSignal(msg: SignalMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encode(msg));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.files.abort("interrupted");
    try { this.ws?.close(); } catch { /* ignore */ }
    try { this.pc.close(); } catch { /* ignore */ }
    try { this.filesPc.close(); } catch { /* ignore */ }
  }
}
