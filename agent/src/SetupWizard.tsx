import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { disable as autostartDisable, enable as autostartEnable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
import { rich } from "./i18n/rich";
import { LanguageSwitch } from "./i18n/LanguageSwitch";
import { t, useI18n } from "./i18n";
import type { AgentConfig } from "./types";

type Props = { current: AgentConfig; onSaved: (cfg: AgentConfig) => void };

/** Keep in sync with `agent/src-tauri/src/pairing.rs`. */
const MIN_CODE_LEN = 6;
const MAX_CODE_LEN = 128;
const DEFAULT_CODE_LEN = 16;

/**
 * First-run setup wizard.
 *
 * FreeRemoteDesk is BYO-infrastructure: the user runs their own signaling
 * Worker (Cloudflare, free tier) and their own PWA (Vercel, free tier).
 * This screen asks for both URLs and saves them to the agent's config.
 */
export function SetupWizard({ current, onSaved }: Props) {
  const { lang } = useI18n();
  const [signalingUrl, setSignalingUrl] = useState(current.signaling_url ?? "");
  const [pwaUrl, setPwaUrl] = useState(current.pwa_url ?? "");
  const [codeLen, setCodeLen] = useState(current.pairing_code_len ?? DEFAULT_CODE_LEN);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void autostartIsEnabled().then(setStartOnBoot).catch(() => setStartOnBoot(false));
  }, []);

  const canSave = signalingUrl.trim().length > 0 && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setStatus(t("wizard.status.testing"));

    const cleaned = normalizeUrl(signalingUrl);
    try {
      const httpUrl = cleaned.replace(/^ws(s?):/, "http$1:");
      const r = await fetch(`${httpUrl}/health`, { method: "GET" });
      if (!r.ok) throw new Error(`server returned ${r.status}`);
      const j = (await r.json()) as { ok?: boolean; service?: string };
      if (!j.ok || j.service !== "freeremotedesk-signaling") {
        throw new Error(t("wizard.error.notSignaling", { body: JSON.stringify(j) }));
      }
    } catch (err) {
      setStatus(
        t("wizard.error.healthFailed", {
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      setBusy(false);
      return;
    }

    try {
      const next = await invoke<AgentConfig>("set_config", {
        config: {
          ...current,
          signaling_url: cleaned,
          pwa_url: pwaUrl.trim() ? pwaUrl.trim() : null,
          pairing_code_len: codeLen,
          language: lang,
        },
      });

      // Best-effort — don't fail setup if autostart toggling misbehaves.
      try {
        const currentlyEnabled = await autostartIsEnabled();
        if (startOnBoot && !currentlyEnabled) await autostartEnable();
        if (!startOnBoot && currentlyEnabled) await autostartDisable();
      } catch (e) {
        console.warn("autostart toggle failed", e);
      }

      onSaved(next);
    } catch (err) {
      setStatus(
        t("wizard.error.saveFailed", {
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} style={styles.form}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>{t("wizard.title")}</h1>
        <LanguageSwitch
          onChange={(next) => {
            // Mirror to the Rust config so the tray menu follows on next launch.
            invoke("set_language", { language: next }).catch(() => {});
          }}
        />
      </div>
      <div style={styles.help}>{rich(t("wizard.help"))}</div>

      <label style={styles.label}>
        <span>
          {t("wizard.signaling.label")} <span style={styles.req}>*</span>
        </span>
        <input
          value={signalingUrl}
          onChange={(e) => setSignalingUrl(e.target.value)}
          placeholder={t("wizard.signaling.placeholder")}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={styles.input}
        />
        <span style={styles.hint}>{t("wizard.signaling.hint")}</span>
      </label>

      <label style={styles.label}>
        <span>
          {t("wizard.pwa.label")}{" "}
          <span style={styles.opt}>{t("wizard.pwa.optional")}</span>
        </span>
        <input
          value={pwaUrl}
          onChange={(e) => setPwaUrl(e.target.value)}
          placeholder={t("wizard.pwa.placeholder")}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={styles.input}
        />
        <span style={styles.hint}>{t("wizard.pwa.hint")}</span>
      </label>

      <label style={styles.label}>
        <span>{t("wizard.codeLen.label")}</span>
        <input
          type="number"
          min={MIN_CODE_LEN}
          max={MAX_CODE_LEN}
          value={codeLen}
          onChange={(e) => setCodeLen(Number(e.target.value))}
          style={styles.input}
        />
        <span style={styles.hint}>
          {t("wizard.codeLen.hint", { min: MIN_CODE_LEN, max: MAX_CODE_LEN })}
        </span>
      </label>

      <label style={styles.check}>
        <input
          type="checkbox"
          checked={startOnBoot}
          onChange={(e) => setStartOnBoot(e.target.checked)}
        />
        <span>{t("wizard.autostart")}</span>
      </label>

      <button type="submit" disabled={!canSave} style={styles.primary}>
        {busy ? t("wizard.action.saving") : t("wizard.action.save")}
      </button>

      {status && <div style={styles.error}>{status}</div>}

      <div style={styles.footer}>{t("wizard.footer")}</div>
    </form>
  );
}

function normalizeUrl(u: string): string {
  const trimmed = u.trim().replace(/\/+$/, "");
  if (/^(https?|wss?):\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    maxWidth: 440,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    padding: "2rem",
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
  },
  help: { opacity: 0.7, fontSize: "0.9rem", lineHeight: 1.5 },
  label: { display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.9rem" },
  check: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  input: {
    background: "#0a0a0a",
    color: "#f5f5f5",
    border: "1px solid #2a2a2a",
    padding: "0.6rem 0.8rem",
    borderRadius: 6,
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.9rem",
    outline: "none",
  },
  hint: { opacity: 0.5, fontSize: "0.8rem" },
  req: { color: "#ef4444" },
  opt: { opacity: 0.5, fontSize: "0.8rem" },
  primary: {
    background: "#4ade80",
    color: "#000",
    border: 0,
    padding: "0.8rem 1.4rem",
    borderRadius: 6,
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: "#ef4444", fontSize: "0.85rem" },
  footer: { opacity: 0.4, fontSize: "0.75rem", marginTop: "0.5rem" },
};
