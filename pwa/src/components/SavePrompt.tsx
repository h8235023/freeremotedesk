import { useEffect, useState } from "react";
import { t, useI18n } from "../i18n";
import { rich } from "../i18n/rich";
import {
  defaultDeviceName,
  generateClientId,
  generateSecret,
  makeTrustUrl,
  saveHost,
  type SavedHost,
} from "../savedHosts";
import type { PeerClient } from "../webrtc/client";
import type { ControlMessage } from "../webrtc/protocol";

type Props = {
  client: PeerClient;
  onSaved: (hostName: string) => void;
  onDismiss: () => void;
};

type Phase =
  | { kind: "form" }
  | { kind: "saving" }
  | { kind: "success"; entry: SavedHost; trustUrl: string }
  | { kind: "error"; reason: string };

/**
 * Post-pair modal: "Save this host?" → device-name entry → save →
 * "Here's your bookmark URL for extra durability."
 */
export function SavePrompt({ client, onSaved, onDismiss }: Props) {
  useI18n(); // re-render on language change
  const [deviceName, setDeviceName] = useState(defaultDeviceName());
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [urlCopied, setUrlCopied] = useState(false);

  // This modal is shown as soon as pairing *starts*, which on a phone can be
  // seconds before ICE finishes and the host's "control" DataChannel opens.
  // Sending into that gap is what produced the "control channel not open yet"
  // error, so gate on readiness instead of letting the user discover it.
  const [controlOpen, setControlOpen] = useState(() => client.isControlOpen());
  const [iceState, setIceState] = useState<string>("new");

  useEffect(() => {
    setControlOpen(client.isControlOpen());
    const offOpen = client.on("onControlOpen", () => setControlOpen(true));
    const offState = client.on("onStateChange", (s) => setIceState(s));
    return () => {
      offOpen();
      offState();
    };
  }, [client]);

  const connectionFailed =
    iceState === "failed" || iceState === "disconnected" || iceState === "closed";

  async function save() {
    if (!deviceName.trim() || !controlOpen) return;
    setPhase({ kind: "saving" });

    const clientId = generateClientId();
    const secret = generateSecret();

    // Both of these are torn down on every exit path — the early `!sent`
    // return used to leak the listener and leave a timer running.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offControl: (() => void) | undefined;

    const responsePromise = new Promise<
      { ok: true; hostId: string; hostName: string } | { ok: false; reason: string }
    >((resolve) => {
      offControl = client.on("onControlMessage", (msg: ControlMessage) => {
        if (msg.t === "pair.save.ok") {
          resolve({ ok: true, hostId: msg.hostId, hostName: msg.hostName });
        } else if (msg.t === "pair.save.fail") {
          resolve({ ok: false, reason: msg.reason ?? t("save.error.rejected") });
        }
      });
      timer = setTimeout(
        () => resolve({ ok: false, reason: t("save.error.timeout") }),
        5000,
      );
    });

    const sent = client.sendControl({
      t: "pair.save",
      clientId,
      deviceName: deviceName.trim(),
      secret,
    });
    if (!sent) {
      if (timer) clearTimeout(timer);
      offControl?.();
      setPhase({ kind: "error", reason: t("save.error.controlChannel") });
      return;
    }

    const res = await responsePromise;
    if (timer) clearTimeout(timer);
    offControl?.();
    if (!res.ok) {
      setPhase({ kind: "error", reason: res.reason });
      return;
    }

    const entry: SavedHost = {
      hostId: res.hostId,
      hostName: res.hostName,
      clientId,
      secret,
      addedAt: Date.now(),
      lastConnectedAt: Date.now(),
    };
    saveHost(entry);
    const trustUrl = makeTrustUrl(entry, window.location.origin);
    setPhase({ kind: "success", entry, trustUrl });
  }

  async function copyTrustUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch { /* clipboard perms */ }
  }

  return (
    <div style={styles.backdrop} onClick={onDismiss}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        {phase.kind === "form" && (
          <>
            <div style={styles.title}>{t("save.title")}</div>
            <div style={styles.help}>{t("save.help")}</div>
            {!controlOpen && (
              <div style={{ ...styles.hint, color: connectionFailed ? "#fca5a5" : undefined }}>
                {connectionFailed
                  ? t("save.wait.failed", { state: iceState })
                  : t("save.wait.connecting", { state: iceState })}
              </div>
            )}
            <label style={styles.label}>
              <span style={styles.hint}>{t("save.deviceName")}</span>
              <input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder={t("save.deviceNamePlaceholder")}
                style={styles.input}
                autoFocus
              />
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                onClick={save}
                disabled={!deviceName.trim() || !controlOpen}
                style={{
                  ...styles.btn,
                  ...styles.primary,
                  ...(deviceName.trim() && controlOpen ? null : styles.btnDisabled),
                }}
              >
                {t("save.action.save")}
              </button>
              <button onClick={onDismiss} style={styles.btn}>{t("save.action.notNow")}</button>
            </div>
          </>
        )}

        {phase.kind === "saving" && (
          <div style={{ padding: "1rem 0", textAlign: "center", opacity: 0.7 }}>
            {t("save.saving")}
          </div>
        )}

        {phase.kind === "success" && (
          <>
            <div style={styles.title}>{t("save.success.title")}</div>
            <div style={styles.help}>
              {rich(t("save.success.help", { name: phase.entry.hostName }))}
            </div>
            <div style={styles.help}>{rich(t("save.success.recommend"))}</div>
            <div style={styles.urlBox}>
              <input
                readOnly
                value={phase.trustUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={styles.urlInput}
              />
              <button
                onClick={() => copyTrustUrl(phase.trustUrl)}
                style={styles.copyBtn}
              >
                {urlCopied ? t("save.action.copied") : t("save.action.copy")}
              </button>
            </div>
            <div style={styles.hint}>{t("save.warning")}</div>
            <button
              onClick={() => {
                onSaved(phase.entry.hostName);
              }}
              style={{ ...styles.btn, ...styles.primary }}
            >
              {t("save.action.done")}
            </button>
          </>
        )}

        {phase.kind === "error" && (
          <>
            <div style={styles.title}>{t("save.error.title")}</div>
            <div style={{ ...styles.help, color: "#fca5a5" }}>{phase.reason}</div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setPhase({ kind: "form" })}
                style={{ ...styles.btn, ...styles.primary }}
              >
                {t("save.action.tryAgain")}
              </button>
              <button onClick={onDismiss} style={styles.btn}>{t("save.action.close")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "1rem", zIndex: 100,
  },
  card: {
    maxWidth: 480, width: "100%",
    background: "#171717", border: "1px solid #2a2a2a", borderRadius: 10,
    padding: "1.4rem",
    display: "flex", flexDirection: "column", gap: "0.9rem",
    color: "#f5f5f5", fontFamily: "system-ui, sans-serif",
  },
  title: { fontSize: "1.05rem", fontWeight: 600 },
  help: { opacity: 0.75, fontSize: "0.9rem", lineHeight: 1.5 },
  label: { display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem" },
  hint: { opacity: 0.55, fontSize: "0.75rem" },
  input: {
    background: "#0a0a0a", color: "#f5f5f5",
    border: "1px solid #2a2a2a", padding: "0.5rem 0.7rem", borderRadius: 6,
    fontSize: "0.9rem", outline: "none",
  },
  btn: {
    background: "#2a2a2a", color: "#f5f5f5",
    border: "1px solid #3a3a3a", padding: "0.5rem 1rem", borderRadius: 6,
    cursor: "pointer", fontSize: "0.9rem",
  },
  primary: {
    background: "#4ade80", color: "#000",
    borderColor: "#4ade80", fontWeight: 600,
  },
  btnDisabled: {
    opacity: 0.45, cursor: "not-allowed",
  },
  urlBox: {
    display: "flex", gap: "0.4rem", alignItems: "stretch",
    background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 6,
    padding: "0.3rem",
  },
  urlInput: {
    flex: 1, background: "transparent", color: "#f5f5f5",
    border: 0, outline: "none", fontFamily: "ui-monospace, monospace",
    fontSize: "0.75rem", padding: "0.3rem",
    overflow: "hidden", textOverflow: "ellipsis",
  },
  copyBtn: {
    background: "#2a2a2a", color: "#f5f5f5",
    border: "1px solid #3a3a3a", borderRadius: 4,
    padding: "0.3rem 0.7rem", fontSize: "0.75rem", cursor: "pointer",
  },
};
