import { useState } from "react";
import { setSignalingUrl, toHttpUrl } from "../config";
import { t, useI18n } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";

type Props = { onSaved: (url: string) => void };

/**
 * Shown when the PWA has no signaling URL configured (no env var + no
 * localStorage). Prompts the user to paste their own Cloudflare Workers URL.
 *
 * For the "one click deploy" path this screen never shows — Vercel builds
 * the PWA with VITE_SIGNALING_URL baked in.
 */
export function SetupScreen({ onSaved }: Props) {
  useI18n(); // re-render on language change
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = url.trim().length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setStatus(t("setup.action.testing"));
    try {
      const cleaned = url.trim().replace(/\/+$/, "");
      const r = await fetch(`${toHttpUrl(cleaned)}/health`, { method: "GET" });
      if (!r.ok) throw new Error(t("setup.error.serverReturned", { status: r.status }));
      const j = (await r.json()) as { ok?: boolean; service?: string };
      if (!j.ok || j.service !== "freeremotedesk-signaling") {
        throw new Error(t("setup.error.notSignaling"));
      }
      setSignalingUrl(cleaned);
      onSaved(cleaned);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("setup.error.healthCheck"));
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div>
        <h1 style={{ margin: 0 }}>FreeRemoteDesk</h1>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          {t("setup.subtitle")}
        </p>
      </div>

      <input
        autoFocus
        placeholder={t("setup.placeholder")}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ letterSpacing: 0, textTransform: "none", fontSize: "0.85rem" }}
      />

      <button type="submit" disabled={!canSubmit}>
        {busy ? t("setup.action.testing") : t("setup.action.continue")}
      </button>

      {status && <div className="muted">{status}</div>}

      <div className="muted" style={{ fontSize: "0.75rem", opacity: 0.6 }}>
        {t("setup.footer")}
      </div>

      <LanguageSwitch style={{ justifyContent: "center" }} />
    </form>
  );
}
