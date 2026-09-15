/**
 * Marketing landing page — the first thing visitors see at the domain root.
 *
 * SPA-simple: react conditional on pathname. Once user clicks the CTA we
 * navigate to /connect where the actual PWA client lives.
 */

import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { About } from "../components/About";

const FORK_URL = "https://github.com/h8235023/freeremotedesk";
const UPSTREAM_URL = "https://github.com/Teylersf/freeremotedesk";
import { useI18n } from "../i18n";
import { rich } from "../i18n/rich";

/** Feature cards — icons stay here, copy lives in the dictionaries. */
const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6"] as const;
const FEATURE_ICONS: Record<(typeof FEATURES)[number], string> = {
  f1: "🔒",
  f2: "💸",
  f3: "📱",
  f4: "⚡",
  f5: "🔑",
  f6: "🤖",
};

export function Landing() {
  const { t } = useI18n();

  return (
    <main style={styles.main}>
      <section style={styles.hero}>
        <div style={styles.logoRow}>
          <div style={styles.logoDot} />
          <span style={styles.logoText}>FreeRemoteDesk</span>
        </div>
        <h1 style={styles.h1}>
          {t("landing.hero.line1")} <br />
          {t("landing.hero.line2")} <br />
          <span style={styles.gradient}>{t("landing.hero.free")}</span>
        </h1>
        <p style={styles.subhead}>{t("landing.subhead")}</p>
        <div style={styles.ctas}>
          <a href="/connect" style={styles.primary}>
            {t("landing.cta.open")}
          </a>
          <a
            href="https://github.com/Teylersf/freeremotedesk"
            target="_blank"
            rel="noopener"
            style={styles.secondary}
          >
            {t("landing.cta.deploy")}
          </a>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>{t("landing.why.title")}</h2>
        <div style={styles.grid}>
          {FEATURES.map((k) => (
            <div key={k} style={styles.card}>
              <div style={styles.cardIcon}>{FEATURE_ICONS[k]}</div>
              <div style={styles.cardTitle}>{t(`landing.${k}.title`)}</div>
              <div style={styles.cardBody}>{t(`landing.${k}.body`)}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>{t("landing.setup.title")}</h2>
        <ol style={styles.steps}>
          {(["step1", "step2", "step3"] as const).map((k) => (
            <li key={k} style={styles.step}>
              {rich(t(`landing.${k}`))}
            </li>
          ))}
        </ol>
        <div style={styles.stepsFoot}>
          {t("landing.stepsFoot.prefix")}
          <a href="https://github.com/Teylersf/freeremotedesk" style={styles.link}>
            {t("landing.stepsFoot.link")}
          </a>
          {t("landing.stepsFoot.after")}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>{t("landing.how.title")}</h2>
        <p style={styles.paragraph}>{rich(t("landing.how.p1"))}</p>
        <p style={styles.paragraph}>{rich(t("landing.how.p2"))}</p>
        <p style={styles.paragraph}>{rich(t("landing.how.p3"))}</p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>{t("landing.trust.title")}</h2>
        <p style={styles.paragraph}>{t("landing.trust.body")}</p>
      </section>

      <footer style={styles.footer}>
        <div>
          {t("landing.footer.note")}
          <a href={FORK_URL} style={styles.link}>
            {t("landing.footer.repo")}
          </a>
        </div>
        <div style={styles.footerLinks}>
          <LanguageSwitch />
          <a href="/connect" style={styles.link}>{t("landing.footer.client")}</a>
          <a href={`${FORK_URL}/releases/latest`} style={styles.link}>
            {t("landing.footer.download")}
          </a>
          <a href={`${FORK_URL}/blob/main/AGENTS.md`} style={styles.link}>
            {t("landing.footer.agents")}
          </a>
          <a href={UPSTREAM_URL} style={styles.link}>
            {t("about.upstream")}
          </a>
        </div>
        <About />
      </footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: "#0a0a0a",
    color: "#f5f5f5",
    minHeight: "100vh",
    padding: "0",
  },
  hero: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "5rem 1.5rem 3rem",
    textAlign: "center",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    marginBottom: "2rem",
    opacity: 0.9,
  },
  logoDot: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 12px #4ade80",
  },
  logoText: { fontSize: "1.05rem", fontWeight: 600, letterSpacing: "-0.01em" },
  h1: {
    fontSize: "clamp(2rem, 5.5vw, 3.5rem)",
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: "-0.03em",
    margin: "0 0 1.5rem",
  },
  gradient: {
    background: "linear-gradient(90deg, #4ade80, #22d3ee)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subhead: {
    maxWidth: 640,
    margin: "0 auto 2.5rem",
    fontSize: "clamp(1rem, 2.2vw, 1.15rem)",
    lineHeight: 1.55,
    opacity: 0.75,
  },
  ctas: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    justifyContent: "center",
  },
  primary: {
    background: "#4ade80",
    color: "#000",
    padding: "0.85rem 1.6rem",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "1rem",
    textDecoration: "none",
    border: 0,
  },
  secondary: {
    background: "transparent",
    color: "#f5f5f5",
    padding: "0.85rem 1.6rem",
    borderRadius: 8,
    fontWeight: 500,
    fontSize: "1rem",
    textDecoration: "none",
    border: "1px solid #333",
  },
  section: {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "3rem 1.5rem",
  },
  h2: {
    fontSize: "clamp(1.5rem, 3vw, 2rem)",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: "0 0 2rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "1.4rem",
  },
  cardIcon: { fontSize: "1.4rem", marginBottom: "0.6rem" },
  cardTitle: { fontWeight: 600, marginBottom: "0.4rem", fontSize: "1.05rem" },
  cardBody: { opacity: 0.7, fontSize: "0.92rem", lineHeight: 1.55 },
  steps: {
    listStyle: "decimal",
    paddingLeft: "1.4rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    margin: 0,
  },
  step: { fontSize: "1rem", lineHeight: 1.6, opacity: 0.85 },
  stepsFoot: { marginTop: "1.5rem", opacity: 0.55, fontSize: "0.9rem" },
  paragraph: {
    fontSize: "1rem",
    lineHeight: 1.65,
    opacity: 0.8,
    maxWidth: 780,
    margin: "0 0 1rem",
  },
  code: {
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.9em",
    background: "#171717",
    padding: "0.1rem 0.4rem",
    borderRadius: 4,
    border: "1px solid #2a2a2a",
  },
  link: { color: "#4ade80", textDecoration: "none" },
  footer: {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "3rem 1.5rem 4rem",
    borderTop: "1px solid #1f1f1f",
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "1rem",
    fontSize: "0.9rem",
    opacity: 0.7,
  },
  footerLinks: { display: "flex", gap: "1.5rem", flexWrap: "wrap" },
};
