/** Language picker. Switching re-renders every `useI18n` consumer at once. */

import { LANGS, useI18n } from "./index";

export function LanguageSwitch({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang, t } = useI18n();

  return (
    <label style={{ ...styles.wrap, ...style }}>
      <span style={styles.label}>{t("lang.label")}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as typeof lang)}
        style={styles.select}
      >
        {LANGS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" },
  label: { opacity: 0.55 },
  select: {
    background: "#0a0a0a",
    color: "#f5f5f5",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "0.25rem 0.5rem",
    fontSize: "0.8rem",
    outline: "none",
  },
};
