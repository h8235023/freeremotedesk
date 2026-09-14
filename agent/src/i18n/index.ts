/**
 * Minimal i18n for the agent UI — no third-party dependency.
 *
 * Deliberately a copy of `pwa/src/i18n/index.ts` rather than a shared workspace
 * package: Vercel builds the PWA standalone with `npm install`, so a
 * `workspace:*` dependency there would break the deploy (see AGENTS.md).
 *
 * The Rust side (`tray.rs`) can't use this module. It reads the saved language
 * out of the agent config instead, so the tray menu follows the UI language
 * after a restart.
 */

import { useSyncExternalStore } from "react";
import { en, type MessageKey } from "./en";
import { zhCN } from "./zh-CN";

export type Lang = "zh-CN" | "en";
export type { MessageKey };

const STORAGE_KEY = "lang";

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, "zh-CN": zhCN };

export const LANGS: { value: Lang; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
];

const listeners = new Set<() => void>();
let current: Lang = readInitialLang();

function isLang(v: unknown): v is Lang {
  return v === "zh-CN" || v === "en";
}

/** Language for a first visit, before the user has picked one. */
function detectLang(): Lang {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  }
  return "en";
}

function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return detectLang();
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  applyDocumentLang();
  listeners.forEach((fn) => fn());
}

export function applyDocumentLang(): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = current;
  }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Translate `key`, replacing `{name}` placeholders from `vars`.
 *
 * Values may contain `**bold**` and `` `code` `` markers — see `rich.tsx`.
 */
export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let msg: string = DICTS[current][key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}

/** Re-renders the calling component whenever the language changes. */
export function useI18n(): {
  t: typeof t;
  lang: Lang;
  setLang: typeof setLang;
} {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return { t, lang, setLang };
}
