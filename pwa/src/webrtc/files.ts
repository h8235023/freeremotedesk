/**
 * File transfer over the "files" DataChannel — the viewer side.
 *
 * Same wire framing as the agent's `files.ts`: a JSON string is a control
 * message, binary is file bytes, and the channel is ordered+reliable so
 * `file.eof` can never overtake the bytes before it. No length prefixes, no
 * sequence numbers.
 *
 * The one structural difference is the receiving end. The agent streams inbound
 * bytes straight to disk through Rust; a browser can't, so chunks accumulate in
 * memory and become a Blob download at the end. That makes the browser side the
 * one with a real memory ceiling — hence `MAX_RECEIVE_BYTES` here and the
 * refusal before a single byte is accepted.
 */

import { encodeFile, decodeFile, type FileMessage } from "./protocol";

/** 16 KiB. Four times under the smallest real `maxMessageSize` (Safari 256 KiB). */
const CHUNK_BYTES = 16384;

/** Stop feeding the channel above this; resume once it drains to LOW_WATER. */
const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 1024 * 1024;

/**
 * Ceiling on a file the host sends us, because we hold all of it in memory
 * before the download starts. The host has its own, separate, configurable
 * ceiling for the other direction.
 */
const MAX_RECEIVE_BYTES = 256 * 1024 * 1024;

export type TransferDirection = "in" | "out";

export type TransferProgress = {
  direction: TransferDirection;
  name: string;
  done: number;
  total: number;
};

export type TransferDone = {
  direction: TransferDirection;
  name: string;
  path?: string;
  bytes: number;
};

export type FileTransferEvents = {
  onProgress: (p: TransferProgress) => void;
  onIncoming: (name: string, size: number) => void;
  onDone: (d: TransferDone) => void;
  onError: (reason: string, detail?: string) => void;
};

export class FileTransfer {
  /** Chunks of the file currently arriving, in order. */
  private parts: Uint8Array[] = [];
  private inbound: { name: string; size: number; received: number } | null = null;
  private outbound: { name: string; size: number } | null = null;
  private acceptResolver: ((name: string) => void) | null = null;
  private failed: { reason: string; detail?: string } | null = null;

  constructor(
    private readonly channel: () => RTCDataChannel | null,
    private readonly handlers: Partial<FileTransferEvents> = {},
  ) {}

  handleText(raw: string): void {
    const msg = decodeFile(raw);
    if (msg) void this.onMessage(msg);
  }

  handleBinary(buf: ArrayBuffer): void {
    if (!this.inbound || this.failed) return;
    const bytes = new Uint8Array(buf);
    this.parts.push(bytes);
    this.inbound.received += bytes.byteLength;
    this.handlers.onProgress?.({
      direction: "in",
      name: this.inbound.name,
      done: this.inbound.received,
      total: this.inbound.size,
    });
  }

  private async onMessage(msg: FileMessage): Promise<void> {
    switch (msg.t) {
      case "file.offer": {
        if (this.inbound) {
          this.send({ t: "file.reject", reason: "busy" });
          return;
        }
        if (msg.size > MAX_RECEIVE_BYTES) {
          this.send({
            t: "file.reject",
            reason: "too_large",
            detail: `limit is ${MAX_RECEIVE_BYTES} bytes`,
          });
          this.handlers.onError?.("too_large");
          return;
        }
        this.parts = [];
        this.inbound = { name: msg.name, size: msg.size, received: 0 };
        this.handlers.onIncoming?.(msg.name, msg.size);
        this.send({ t: "file.accept", name: msg.name });
        break;
      }

      case "file.eof": {
        if (!this.inbound) return;
        const { name, size, received } = this.inbound;
        this.inbound = null;
        if (received !== size) {
          this.parts = [];
          this.send({ t: "file.fail", reason: "incomplete" });
          this.handlers.onError?.("incomplete");
          return;
        }
        const blob = new Blob(this.parts as BlobPart[]);
        this.parts = [];
        triggerDownload(blob, name);
        this.send({ t: "file.done", name, path: "", bytes: size, sha256: "" });
        this.handlers.onDone?.({ direction: "in", name, bytes: size });
        break;
      }

      case "file.accept":
        this.acceptResolver?.(msg.name);
        break;

      case "file.done":
        if (this.outbound) {
          const out = this.outbound;
          this.outbound = null;
          this.handlers.onDone?.({ direction: "out", name: msg.name, bytes: out.size });
        }
        break;

      case "file.reject":
      case "file.fail":
        this.parts = [];
        this.inbound = null;
        this.outbound = null;
        this.handlers.onError?.(msg.reason, msg.detail);
        break;

      case "file.cancel":
        this.parts = [];
        this.inbound = null;
        this.outbound = null;
        break;
    }
  }

  private send(msg: FileMessage): boolean {
    const ch = this.channel();
    if (!ch || ch.readyState !== "open") return false;
    ch.send(encodeFile(msg));
    return true;
  }

  /** Drop everything in flight. Called when the session goes away. */
  abort(_reason = "interrupted"): void {
    this.parts = [];
    this.inbound = null;
    this.outbound = null;
    this.acceptResolver = null;
    this.failed = null;
  }

  /** Send a file to the host. Rejects with a reason code if it refuses. */
  async sendFile(file: File): Promise<void> {
    const stale = this.failed;
    if (stale) throw new Error(stale.reason);
    if (this.outbound || this.inbound) throw new Error("busy");

    const ch = this.channel();
    if (!ch || ch.readyState !== "open") throw new Error("protocol");

    const accepted = new Promise<string>((resolve) => {
      this.acceptResolver = resolve;
    });
    if (!this.send({ t: "file.offer", name: file.name, size: file.size, mime: file.type })) {
      throw new Error("protocol");
    }

    // The host sanitizes and de-collides, so wait for the name it will use —
    // that is the name the user should be told.
    let settledName: string;
    try {
      settledName = await Promise.race([
        accepted,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("interrupted")), 15000),
        ),
      ]);
    } finally {
      this.acceptResolver = null;
    }
    this.outbound = { name: settledName, size: file.size };

    let offset = 0;
    try {
      while (offset < file.size) {
        const broke = this.failed;
        if (broke) throw new Error(broke.reason);
        if (ch.readyState !== "open") throw new Error("interrupted");
        await drain(ch);
        const slice = file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size));
        const buf = await slice.arrayBuffer();
        ch.send(buf);
        offset += buf.byteLength;
        this.handlers.onProgress?.({
          direction: "out",
          name: settledName,
          done: offset,
          total: file.size,
        });
      }
      this.send({ t: "file.eof" });
      // `file.done` (or `file.fail`) arrives async and fires onDone/onError.
    } catch (err) {
      this.outbound = null;
      this.send({ t: "file.cancel" });
      const reason = err instanceof Error ? err.message : "interrupted";
      this.handlers.onError?.(reason);
      throw new Error(reason);
    }
  }
}

/** Hand a received file to the browser's download machinery. */
function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Wait until the channel's send queue has drained below the low-water mark.
 *
 * `bufferedamountlow` is edge-triggered and never fires retroactively, and
 * Safari does not fire it at all when the threshold is 0 — hence the non-zero
 * threshold plus a polling fallback.
 */
function drain(ch: RTCDataChannel): Promise<void> {
  if (ch.bufferedAmount <= HIGH_WATER) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (ch.bufferedAmount <= LOW_WATER) {
        ch.removeEventListener("bufferedamountlow", done);
        clearInterval(poll);
        resolve();
      }
    };
    ch.addEventListener("bufferedamountlow", done);
    const poll = setInterval(done, 250);
  });
}
