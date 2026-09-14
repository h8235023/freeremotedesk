/** Language picker. Switching re-renders every `useI18n` consumer at once. */

import { LANGS, useI18n, type Lang } from "./index";

type Props = {
  style?: React.CSSProperties;
  /**
   * Called after the switch, with the new language. The agent uses this to
   * mirror the choice into the Rust config so the tray menu follows it on the
   * next launch; the PWA has no Rust side and omits it.
   */
  onChange?: (lang: Lang) => void;
};

export function LanguageSwitch({ style, onChange }: Props) {
  const { lang, setLang, t } = useI18n();

  return (
    <label style={{ ...styles.wrap, ...style }}>
      <span style={styles.label}>{t("lang.label")}</span>
      <select
        value={lang}
        onChange={(e) => {
          const next = e.target.value as Lang;
          setLang(next);
          onChange?.(next);
        }}
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
