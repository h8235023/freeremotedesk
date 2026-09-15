import { useEffect, useRef, useState } from "react";
import { t, useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import type { PeerClient } from "../webrtc/client";

type Entry = {
  id: number;
  direction: "in" | "out";
  name: string;
  done: number;
  total: number;
  state: "active" | "done" | "error";
  reason?: string;
};

/** Reason codes → message keys, so a typo fails the typecheck. */
const REASON_KEY: Record<string, MessageKey> = {
  too_large: "file.reason.too_large",
  busy: "file.reason.busy",
  io: "file.reason.io",
  cancelled: "file.reason.cancelled",
  interrupted: "file.reason.interrupted",
  incomplete: "file.reason.incomplete",
  unsupported: "file.reason.unsupported",
  protocol: "file.reason.protocol",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/**
 * Floating file-transfer control for the session view.
 *
 * Lives outside `SessionToolbar` on purpose: that component only renders on
 * touch devices, and file transfer has to be reachable from a desktop browser
 * too.
 */
export function FileTransferPanel({ client }: { client: PeerClient }) {
  useI18n(); // re-render on language change
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [channelOpen, setChannelOpen] = useState(() => client.isFilesOpen());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    setChannelOpen(client.isFilesOpen());
    const upsert = (patch: Partial<Entry> & { direction: "in" | "out"; name: string }) => {
      setEntries((prev) => {
        // Match the most recent entry for this name+direction that is still
        // active, so progress updates don't stack up one row per chunk.
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          const e = prev[i];
          if (e && e.name === patch.name && e.direction === patch.direction && e.state === "active") {
            const next = [...prev];
            next[i] = { ...e, ...patch };
            return next;
          }
        }
        return [...prev, { id: nextId.current++, done: 0, total: 0, ...patch } as Entry];
      });
    };

    const offs = [
      client.on("onFilesOpen", () => setChannelOpen(true)),
      client.on("onFileIncoming", (name, size) =>
        upsert({ direction: "in", name, done: 0, total: size, state: "active" }),
      ),
      client.on("onFileProgress", (p) =>
        upsert({
          direction: p.direction,
          name: p.name,
          done: p.done,
          total: p.total,
          state: "active",
        }),
      ),
      client.on("onFileDone", (d) =>
        upsert({ direction: d.direction, name: d.name, done: d.bytes, total: d.bytes, state: "done" }),
      ),
      client.on("onFileError", (reason) =>
        setEntries((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.state === "active") {
            next[next.length - 1] = { ...last, state: "error", reason };
            return next;
          }
          return [
            ...next,
            {
              id: nextId.current++,
              direction: "out",
              name: "",
              done: 0,
              total: 0,
              state: "error",
              reason,
            },
          ];
        }),
      ),
    ];
    return () => offs.forEach((off) => off());
  }, [client]);

  function pickFile(file: File) {
    if (!client.isFilesOpen()) return;
    // Errors arrive via onFileError; nothing else to do here.
    void client.sendFile(file).catch(() => {});
  }

  async function goFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // iOS Safari refuses requestFullscreen on arbitrary elements; the button
      // simply does nothing there rather than pretending it worked.
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) pickFile(file);
        }}
      />

      <div style={styles.cluster}>
        <button style={styles.iconBtn} onClick={() => setOpen((v) => !v)} title={t("file.button")}>
          📎
        </button>
        <button style={styles.iconBtn} onClick={goFullscreen} title={t("file.action.fullscreen")}>
          ⛶
        </button>
      </div>

      {open && (
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <span style={styles.cardTitle}>{t("file.title")}</span>
            <button style={styles.linkBtn} onClick={() => setOpen(false)}>
              {t("file.action.close")}
            </button>
          </div>

          {!channelOpen ? (
            <div style={styles.muted}>{t("file.waiting")}</div>
          ) : (
            <>
              <button style={styles.primary} onClick={() => fileInputRef.current?.click()}>
                {t("file.action.send")}
              </button>
              <div style={styles.muted}>{t("file.hint.slow")}</div>

              {entries.length === 0 ? (
                <div style={styles.muted}>{t("file.empty")}</div>
              ) : (
                <div style={styles.list}>
                  {entries.map((e) => (
                    <div key={e.id} style={styles.row}>
                      <span style={styles.rowName} title={e.name}>
                        {e.name || "—"}
                      </span>
                      <span style={styles.rowStatus}>
                        {e.state === "active" &&
                          t(e.direction === "in" ? "file.status.receiving" : "file.status.sending", {
                            done: formatBytes(e.done),
                            total: formatBytes(e.total),
                          })}
                        {e.state === "done" &&
                          t(e.direction === "in" ? "file.status.downloaded" : "file.status.sent")}
                        {e.state === "error" &&
                          t("file.status.failed", {
                            reason: t(REASON_KEY[e.reason ?? "io"] ?? "file.reason.io"),
                          })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  cluster: {
    position: "fixed",
    top: "env(safe-area-inset-top, 8px)",
    right: 8,
    display: "flex",
    gap: 6,
    zIndex: 30,
  },
  iconBtn: {
    background: "rgba(23,23,23,0.9)",
    color: "#f5f5f5",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 16,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  card: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top, 8px) + 46px)",
    right: 8,
    width: "min(340px, calc(100vw - 1rem))",
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "0.8rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
    color: "#f5f5f5",
    fontFamily: "system-ui, sans-serif",
    zIndex: 30,
  },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: "0.95rem", fontWeight: 600 },
  muted: { opacity: 0.6, fontSize: "0.78rem", lineHeight: 1.4 },
  primary: {
    background: "#4ade80",
    color: "#000",
    border: 0,
    padding: "0.5rem 1rem",
    borderRadius: 6,
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  linkBtn: {
    background: "transparent",
    color: "#f5f5f5",
    border: 0,
    opacity: 0.7,
    fontSize: "0.78rem",
    cursor: "pointer",
  },
  list: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" },
  row: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.75rem" },
  rowName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 150,
  },
  rowStatus: { opacity: 0.65, flexShrink: 0 },
};
