/**
 * File transfer over the "files" DataChannel.
 *
 * This one class handles both directions, because the framing is symmetric: a
 * JSON string is a control message, binary is file bytes, and the channel is
 * ordered+reliable so `file.eof` can never overtake the bytes before it. That
 * means no length prefixes and no sequence numbers — the only integrity
 * backstop needed is the declared size plus the SHA-256 the Rust side computes
 * while writing.
 *
 * Only one transfer runs at a time in either direction. That keeps the state
 * machine small and makes "which file is this chunk for?" unanswerable-wrong.
 */

import { invoke } from "@tauri-apps/api/core";
import { decodeFile, encodeFile, type FileMessage } from "../protocol";

/** 16 KiB. Four times under the smallest real `maxMessageSize` (Safari 256 KiB). */
const CHUNK_BYTES = 16384;

/** Stop feeding the channel above this; resume once it drains to LOW_WATER. */
const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 1024 * 1024;

/** Cap on chunks queued for the Rust writer but not yet written. */
const MAX_QUEUED = 8 * 1024 * 1024;

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
  /** Host-side absolute path — only meaningful for an inbound transfer. */
  path?: string;
  bytes: number;
};

export type FileTransferEvents = {
  onProgress: (p: TransferProgress) => void;
  /** A peer wants to send us a file. Fires before any bytes arrive. */
  onIncoming: (name: string, size: number) => void;
  onDone: (d: TransferDone) => void;
  onError: (reason: string, detail?: string) => void;
};

/** Codes cross the wire and get translated at the far end. Never prose. */
function reasonOf(err: unknown): { reason: string; detail?: string } {
  const text = err instanceof Error ? err.message : String(err);
  // Rust returns codes like "too_large:1234:5678" or plain "busy".
  const code = text.split(":")[0] ?? "";
  const known = ["too_large", "busy", "io", "cancelled", "interrupted", "unsupported", "protocol"];
  return known.includes(code) ? { reason: code, detail: text } : { reason: "io", detail: text };
}

export class FileTransfer {
  private chain: Promise<void> = Promise.resolve();
  private queued = 0;
  /** Set once something goes wrong; every later chunk short-circuits. */
  private failed: { reason: string; detail?: string } | null = null;
  private inbound: { name: string; size: number; written: number } | null = null;
  private outbound: { name: string; size: number } | null = null;
  /** Resolved when the peer answers our offer with the name it will use. */
  private acceptResolver: ((name: string) => void) | null = null;

  constructor(
    private readonly channel: () => RTCDataChannel | null,
    private readonly handlers: Partial<FileTransferEvents> = {},
  ) {}

  /** Feed a string frame from the DataChannel. */
  handleText(raw: string): void {
    const msg = decodeFile(raw);
    if (msg) void this.onMessage(msg);
  }

  /** Feed a binary frame. Only valid while we are the receiving side. */
  handleBinary(buf: ArrayBuffer): void {
    if (this.failed) return;
    const bytes = new Uint8Array(buf);
    if (bytes.byteLength > CHUNK_BYTES * 4) {
      return this.fail("interrupted", "oversized chunk");
    }
    this.queued += bytes.byteLength;
    if (this.queued > MAX_QUEUED) {
      return this.fail("interrupted", "receiver overflow");
    }
    // Serialising on one promise is what preserves chunk order into Rust —
    // and therefore what makes a sequence number unnecessary.
    let b64: string;
    try {
      b64 = bytesToBase64(bytes);
    } catch (e) {
      return this.fail("io", String(e));
    }
    this.chain = this.chain
      .then(() => invoke("write_file_chunk", { dataBase64: b64 }))
      .then(() => {
        this.queued -= bytes.byteLength;
        this.reportProgress(bytes.byteLength);
      })
      .catch((err) => {
        const { reason, detail } = reasonOf(err);
        this.fail(reason, detail);
      });
  }

  private async onMessage(msg: FileMessage): Promise<void> {
    switch (msg.t) {
      case "file.offer": {
        if (this.failed) return;
        try {
          const begun = await invoke<{ name: string; size: number }>("begin_file_receive", {
            name: msg.name,
            size: msg.size,
          });
          this.inbound = { name: begun.name, size: begun.size, written: 0 };
          this.handlers.onIncoming?.(begun.name, begun.size);
          this.send({ t: "file.accept", name: begun.name });
        } catch (err) {
          const { reason, detail } = reasonOf(err);
          this.send({ t: "file.reject", reason, detail });
          this.handlers.onError?.(reason, detail);
        }
        break;
      }

      case "file.eof": {
        try {
          await this.chain; // every queued write must land before we finalize
          if (this.failed) return;
          const done = await invoke<{
            name: string;
            path: string;
            bytes: number;
            sha256: string;
          }>("end_file_receive");
          this.inbound = null;
          this.send({ t: "file.done", ...done });
          this.handlers.onDone?.({
            direction: "in",
            name: done.name,
            path: done.path,
            bytes: done.bytes,
          });
        } catch (err) {
          const { reason, detail } = reasonOf(err);
          this.fail(reason, detail);
        }
        break;
      }

      case "file.done": {
        // We were the sender.
        const out = this.outbound;
        this.outbound = null;
        if (out) {
          this.handlers.onDone?.({
            direction: "out",
            name: msg.name,
            bytes: msg.bytes,
          });
        }
        break;
      }

      case "file.reject":
      case "file.fail": {
        this.abortLocal();
        this.handlers.onError?.(msg.reason, msg.detail);
        break;
      }

      case "file.cancel": {
        // The peer gave up on receiving, or is telling us it aborted.
        this.abortLocal();
        void invoke("abort_file_receive").catch(() => {});
        break;
      }

      case "file.accept": {
        // Handled inline by sendFile's wait loop.
        this.acceptResolver?.(msg.name);
        break;
      }
    }
  }

  private reportProgress(delta: number) {
    if (!this.inbound) return;
    this.inbound.written += delta;
    this.handlers.onProgress?.({
      direction: "in",
      name: this.inbound.name,
      done: this.inbound.written,
      total: this.inbound.size,
    });
  }

  private send(msg: FileMessage): boolean {
    const ch = this.channel();
    if (!ch || ch.readyState !== "open") return false;
    ch.send(encodeFile(msg));
    return true;
  }

  private fail(reason: string, detail?: string) {
    if (this.failed) return;
    this.failed = { reason, detail };
    this.abortLocal();
    this.send({ t: "file.fail", reason, detail });
    void invoke("abort_file_receive").catch(() => {});
    this.handlers.onError?.(reason, detail);
  }

  private abortLocal() {
    this.inbound = null;
    this.outbound = null;
  }

  /** Reset per-transfer state. Called when a new session starts. */
  reset(): void {
    this.failed = null;
    this.queued = 0;
    this.chain = Promise.resolve();
    this.abortLocal();
  }

  /** Abort whatever is in flight because the session is going away. */
  abort(reason = "interrupted"): void {
    if (this.inbound || this.outbound) {
      this.fail(reason);
    }
    this.reset();
  }

  /**
   * Push a file to the peer. Resolves once the peer has confirmed it wrote the
   * bytes; rejects with a reason code if it refused or the transfer broke.
   */
  async sendFile(file: File): Promise<void> {
    // Read into a local: `fail()` assigns `this.failed` from a callback, so
    // control-flow analysis can't narrow the property here.
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

    // The peer sanitizes and de-collides, so wait for the name it will use —
    // that is the name the user should be told.
    const settledName = await Promise.race([
      accepted,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("interrupted")), 15000),
      ),
    ]);
    this.acceptResolver = null;
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
      const { reason, detail } = reasonOf(err);
      this.outbound = null;
      this.send({ t: "file.cancel" });
      this.handlers.onError?.(reason, detail);
      throw new Error(reason);
    }
  }
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

/**
 * btoa needs a binary string; building it in chunks avoids blowing the argument
 * limit on large arrays.
 *
 * NOTE: the outbound path above deliberately sends `ArrayBuffer` directly rather
 * than base64 — that is the receive direction only, where Rust has to decode.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
