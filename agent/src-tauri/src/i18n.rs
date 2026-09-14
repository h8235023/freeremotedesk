//! Rust-side strings for text that never passes through the WebView.
//!
//! The desktop UI is localized in `agent/src/i18n/` (TypeScript). Two things
//! can't reach it:
//!
//!   1. The tray menu — built once at startup by `tray.rs`, before any WebView
//!      exists. It re-reads the saved language on the next launch.
//!   2. Fallback strings written into the config file (`config.rs`), which are
//!      persisted and therefore can't follow a later language switch.
//!
//! Keep the values here in sync with `agent/src/i18n/en.ts` and `zh-CN.ts` —
//! there is no build-time check tying the two together, because the Rust and
//! TypeScript halves of the agent can't share a module.

use tauri::AppHandle;

/// Pick `en` or `zh` based on the saved UI language.
pub fn tr(app: &AppHandle, en: &str, zh: &str) -> String {
    if crate::config::language(app) == "en" {
        en.to_string()
    } else {
        zh.to_string()
    }
}
