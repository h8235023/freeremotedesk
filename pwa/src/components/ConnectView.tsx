import { useState } from "react";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { listSavedHosts, markConnected, type SavedHost } from "../savedHosts";
import { PeerClient } from "../webrtc/client";
import { SavedHostsList } from "./SavedHostsList";

type Props = {
  signalingUrl: string;
  onConnected: (client: PeerClient, mode: "pair" | "reconnect") => void;
  onOpenSettings: () => void;
};

/** Longest room key the signaling Worker accepts (`signaling/src/index.ts`).
 *  How long a code actually is, is the host's choice — this side assumes none. */
const MAX_CODE_LEN = 128;

export function ConnectView({ signalingUrl, onConnected, onOpenSettings }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedHosts, setSavedHosts] = useState<SavedHost[]>(() => listSavedHosts());

  const canSubmit = code.trim().length > 0 && !busy;

  function refresh() {
    setSavedHosts(listSavedHosts());
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setStatus(t("connect.action.connecting"));
    const client = new PeerClient({
      code: code.trim().toLowerCase(),
      signalingUrl,
    });
    try {
      await client.connect();
      onConnected(client, "pair");
    } catch (err) {
      client.close();
      setStatus(err instanceof Error ? err.message : t("connect.status.failed"));
      setBusy(false);
    }
  }

  async function reconnectTo(host: SavedHost) {
    setBusy(true);
    setStatus(t("connect.status.connectingTo", { name: host.hostName }));
    const client = new PeerClient({
      code: `host-${host.hostId}`,
      signalingUrl,
      auth: { clientId: host.clientId, secret: host.secret },
    });
    // Wait for auth result before proceeding.
    const authed = new Promise<boolean>((resolve) => {
      client.on("onAuthResult", (ok) => resolve(ok));
      setTimeout(() => resolve(false), 10000);
    });
    try {
      await client.connect();
      const ok = await authed;
      if (!ok) {
        setStatus(t("connect.status.authFailed", { name: host.hostName }));
        client.close();
        setBusy(false);
        return;
      }
      markConnected(host.hostId);
      onConnected(client, "reconnect");
    } catch (err) {
      client.close();
      setStatus(err instanceof Error ? err.message : t("connect.status.failed"));
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          {savedHosts.length > 0
            ? t("connect.subtitle.saved")
            : t("connect.subtitle.empty")}
        </p>
      </div>

      <SavedHostsList hosts={savedHosts} onConnect={reconnectTo} onRefresh={refresh} />

      <form onSubmit={submitCode} style={styles.form}>
        {savedHosts.length > 0 && <div style={styles.sectionLabel}>{t("connect.pairNew")}</div>}
        <input
          maxLength={MAX_CODE_LEN}
          placeholder={t("connect.placeholder")}
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/[^a-z0-9]/gi, "").slice(0, MAX_CODE_LEN))
          }
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={!canSubmit}>
          {busy ? t("connect.action.connecting") : t("connect.action.connect")}
        </button>
      </form>

      {status && <div className="muted">{status}</div>}

      <button type="button" onClick={onOpenSettings} style={styles.link}>
        {t("connect.changeServer")}
      </button>

      <LanguageSwitch style={{ justifyContent: "center" }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 420,
    margin: "3rem auto",
    padding: "2rem",
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    gap: "1.2rem",
  },
  header: {},
  form: { display: "flex", flexDirection: "column", gap: "0.8rem" },
  sectionLabel: {
    opacity: 0.5,
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  link: {
    background: "transparent",
    border: 0,
    color: "#888",
    cursor: "pointer",
    fontSize: "0.75rem",
    textDecoration: "underline",
    padding: 0,
  },
};
