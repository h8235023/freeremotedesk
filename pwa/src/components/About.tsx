import { useState } from "react";
import { t, useI18n } from "../i18n";
import { rich } from "../i18n/rich";

/** Kept as constants — these are identifiers, not translatable copy. */
const UPSTREAM_URL = "https://github.com/Teylersf/freeremotedesk";
const FORK_URL = "https://github.com/h8235023/freeremotedesk";

/**
 * Version + attribution, collapsed behind a summary so it never crowds the
 * settings screen.
 *
 * The version is the one baked in at build time (`__APP_VERSION__`, from
 * `package.json`). The agent window reports its own version separately, via
 * Tauri's `getVersion()` — they are two artifacts and can be updated
 * independently, so neither can speak for the other.
 */
export function About() {
  useI18n(); // re-render on language change
  const [open, setOpen] = useState(false);

  return (
    <details style={styles.wrap} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary style={styles.summary}>{t("about.show")}</summary>
      <div style={styles.body}>
        <div style={styles.version}>{t("about.version", { version: __APP_VERSION__ })}</div>
        <div>{rich(t("about.fork", { upstream: UPSTREAM_URL }))}</div>
        <div>{t("about.ai")}</div>
        <div>{t("about.license")}</div>
        <div style={styles.links}>
          <a href={UPSTREAM_URL} target="_blank" rel="noreferrer" style={styles.link}>
            {t("about.upstream")}
          </a>
          <a href={FORK_URL} target="_blank" rel="noreferrer" style={styles.link}>
            {t("about.thisFork")}
          </a>
        </div>
      </div>
    </details>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { fontSize: "0.78rem", opacity: 0.7 },
  summary: { cursor: "pointer", userSelect: "none" },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    lineHeight: 1.5,
    paddingTop: "0.5rem",
    paddingLeft: "0.2rem",
  },
  version: { fontFamily: "ui-monospace, monospace", opacity: 0.9 },
  links: { display: "flex", gap: "1rem" },
  link: { color: "var(--accent, #4ade80)", textDecoration: "none" },
};
