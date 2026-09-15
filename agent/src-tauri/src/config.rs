//! Agent runtime configuration + trusted-client credential store.
//!
//! FreeRemoteDesk is BYO-infrastructure: each user deploys their own
//! signaling Worker and their own PWA. The agent needs to know the URL of
//! the signaling Worker to talk to.
//!
//! Config lives as JSON in the OS-standard app-config directory:
//!   Windows: %APPDATA%\FreeRemoteDesk\config.json
//!   macOS:   ~/Library/Application Support/FreeRemoteDesk/config.json
//!   Linux:   ~/.config/FreeRemoteDesk/config.json
//!
//! First-run: no config → agent shows the setup wizard.
//!
//! Trusted clients: each successful pair can optionally save a shared secret
//! on both sides. The client stores the raw secret in browser localStorage;
//! the agent stores only a SHA-256 hash — leaking the config file doesn't
//! grant reconnection rights.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CONFIG_FILENAME: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedClient {
    /// Hex-encoded SHA-256 of the shared secret. Not the raw secret.
    pub secret_hash: String,
    /// Human-friendly label the client sent at pair time (e.g. "iPhone 15").
    pub name: String,
    /// Unix seconds at which this credential was created.
    pub created_at: i64,
    /// Unix seconds of the most recent successful auth (for pruning).
    #[serde(default)]
    pub last_used_at: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Full URL of the user's signaling Worker (e.g. `wss://freeremotedesk-signaling.someuser.workers.dev`).
    /// `None` means the agent has never been configured — trigger setup wizard.
    pub signaling_url: Option<String>,

    /// URL of the user's PWA deployment (e.g. `https://myremotedesk.vercel.app`).
    pub pwa_url: Option<String>,

    /// Persistent per-install identifier. Used as the URL key on signaling for
    /// the persistent host WebSocket (`/ws/host-{agent_id}`).
    pub agent_id: String,

    /// How many characters generated pairing codes have. `None` falls back to
    /// [`crate::pairing::DEFAULT_CODE_LEN`]. Clamped into the supported range
    /// when generated, so a hand-edited config can't yield a weak code.
    #[serde(default)]
    pub pairing_code_len: Option<usize>,

    /// UI language for the desktop window and the tray menu. `None` falls back
    /// to [`DEFAULT_LANGUAGE`]. The WebView writes this on save; the Rust side
    /// only reads it (the tray menu is built once, at startup).
    #[serde(default)]
    pub language: Option<String>,

    /// Largest single file a client may send, in bytes. `None` falls back to
    /// [`crate::file::DEFAULT_MAX_TRANSFER_BYTES`]. Enforced in Rust, which is
    /// authoritative — the PWA pre-checks against its own copy only so the user
    /// gets an instant answer instead of a rejection mid-transfer.
    #[serde(default)]
    pub max_transfer_bytes: Option<u64>,

    /// Trusted clients keyed by their opaque client-id. Only the hash of the
    /// shared secret is stored — never the raw value.
    #[serde(default)]
    pub trusted_clients: HashMap<String, TrustedClient>,
}

/// Language used when the config has no (or an unrecognised) `language` value.
pub const DEFAULT_LANGUAGE: &str = "zh-CN";

/// Languages the agent ships translations for.
pub const SUPPORTED_LANGUAGES: [&str; 2] = ["zh-CN", "en"];

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app_config_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    Ok(dir.join(CONFIG_FILENAME))
}

fn load_from_disk(path: &PathBuf) -> AgentConfig {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<AgentConfig>(&s).ok())
        .unwrap_or_default()
}

/// The configured pairing-code length, falling back to the built-in default.
pub fn pairing_code_len(app: &AppHandle) -> Result<usize, String> {
    let path = config_path(app)?;
    Ok(load_from_disk(&path)
        .pairing_code_len
        .unwrap_or(crate::pairing::DEFAULT_CODE_LEN))
}

/// The configured per-file transfer ceiling, falling back to the built-in
/// default. Clamped up to a floor so a hand-edited config can't disable
/// transfers entirely, and down to a ceiling so it can't overflow the counters.
pub fn max_transfer_bytes(app: &AppHandle) -> u64 {
    let saved = config_path(app)
        .ok()
        .map(|path| load_from_disk(&path).max_transfer_bytes)
        .flatten();
    saved
        .map(crate::file::clamp_max_transfer_bytes)
        .unwrap_or(crate::file::DEFAULT_MAX_TRANSFER_BYTES)
}

/// The saved UI language, falling back to [`DEFAULT_LANGUAGE`] when unset or
/// unrecognised. Used by the tray menu and by Rust-side fallback strings, which
/// can't reach the WebView's i18n module.
pub fn language(app: &AppHandle) -> String {
    let saved = config_path(app)
        .ok()
        .map(|path| load_from_disk(&path).language)
        .flatten();
    saved
        .filter(|l| SUPPORTED_LANGUAGES.contains(&l.as_str()))
        .unwrap_or_else(|| DEFAULT_LANGUAGE.to_string())
}


fn ensure_agent_id(cfg: &mut AgentConfig) {
    if cfg.agent_id.is_empty() {
        cfg.agent_id = format!("agent_{}", uuid_hex());
    }
}

/// Reused by `file.rs` to name the `.part` file for an in-flight transfer.
pub(crate) fn uuid_hex() -> String {
    let mut buf = [0u8; 16];
    getrandom::getrandom(&mut buf).expect("OS RNG failed");
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

fn save(path: &PathBuf, cfg: &AgentConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, json).map_err(|e| format!("write config: {e}"))
}

fn hash_secret(secret: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn now_seconds() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---------- Config get/set ----------

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AgentConfig, String> {
    let path = config_path(&app)?;
    let mut cfg = load_from_disk(&path);
    let originally_had_id = !cfg.agent_id.is_empty();
    ensure_agent_id(&mut cfg);
    if !originally_had_id {
        save(&path, &cfg)?;
    }
    Ok(cfg)
}

#[tauri::command]
pub fn set_config(app: AppHandle, config: AgentConfig) -> Result<AgentConfig, String> {
    let path = config_path(&app)?;
    let mut cfg = config;
    ensure_agent_id(&mut cfg);
    if let Some(url) = cfg.signaling_url.as_mut() {
        *url = url.trim().trim_end_matches('/').to_string();
        if url.is_empty() {
            cfg.signaling_url = None;
        }
    }
    if let Some(url) = cfg.pwa_url.as_mut() {
        *url = url.trim().trim_end_matches('/').to_string();
        if url.is_empty() {
            cfg.pwa_url = None;
        }
    }
    // Clamp rather than reject: a stale UI or a hand-edited config shouldn't be
    // able to talk us into generating a trivially guessable code.
    if let Some(len) = cfg.pairing_code_len {
        cfg.pairing_code_len = Some(crate::pairing::clamp_code_len(len));
    }
    if let Some(n) = cfg.max_transfer_bytes {
        cfg.max_transfer_bytes = Some(crate::file::clamp_max_transfer_bytes(n));
    }
    save(&path, &cfg)?;
    Ok(cfg)
}

/// Persist the UI language without touching the rest of the config. The WebView
/// calls this on every switch so the tray menu picks the change up on the next
/// launch. Unsupported values are ignored rather than rejected — the UI owns the
/// authoritative list, this is just a mirror for the Rust side.
#[tauri::command]
pub fn set_language(app: AppHandle, language: String) -> Result<(), String> {
    if !SUPPORTED_LANGUAGES.contains(&language.as_str()) {
        return Ok(());
    }
    let path = config_path(&app)?;
    let mut cfg = load_from_disk(&path);
    ensure_agent_id(&mut cfg);
    cfg.language = Some(language);
    save(&path, &cfg)
}

// ---------- Trusted-client management ----------

#[derive(Debug, Serialize)]
pub struct TrustedClientSummary {
    pub client_id: String,
    pub name: String,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
}

#[tauri::command]
pub fn list_trusted_clients(app: AppHandle) -> Result<Vec<TrustedClientSummary>, String> {
    let path = config_path(&app)?;
    let cfg = load_from_disk(&path);
    let mut list: Vec<TrustedClientSummary> = cfg
        .trusted_clients
        .into_iter()
        .map(|(client_id, tc)| TrustedClientSummary {
            client_id,
            name: tc.name,
            created_at: tc.created_at,
            last_used_at: tc.last_used_at,
        })
        .collect();
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(list)
}

/// Register a new trusted client. Called by the WebView after a successful
/// pair when the user opts to "save this device".
#[tauri::command]
pub fn store_trusted_client(
    app: AppHandle,
    client_id: String,
    name: String,
    secret: String,
) -> Result<(), String> {
    if client_id.is_empty() || secret.is_empty() {
        return Err("client_id and secret are required".to_string());
    }
    let path = config_path(&app)?;
    let mut cfg = load_from_disk(&path);
    ensure_agent_id(&mut cfg);
    let fallback_name = crate::i18n::tr(&app, "Unknown device", "未知设备");
    cfg.trusted_clients.insert(
        client_id,
        TrustedClient {
            secret_hash: hash_secret(&secret),
            name: if name.trim().is_empty() {
                fallback_name
            } else {
                name
            },
            created_at: now_seconds(),
            last_used_at: None,
        },
    );
    save(&path, &cfg)?;
    Ok(())
}

/// Verify a client's presented secret. On success, updates last_used_at.
/// Returns true if the credential matches, false otherwise.
#[tauri::command]
pub fn verify_trusted_client(
    app: AppHandle,
    client_id: String,
    secret: String,
) -> Result<bool, String> {
    let path = config_path(&app)?;
    let mut cfg = load_from_disk(&path);
    let expected_hash = match cfg.trusted_clients.get(&client_id) {
        Some(tc) => tc.secret_hash.clone(),
        None => return Ok(false),
    };
    let presented_hash = hash_secret(&secret);
    // Constant-time compare via subtle-style manual loop (avoid extra crate).
    if presented_hash.len() != expected_hash.len() {
        return Ok(false);
    }
    let mut diff = 0u8;
    for (a, b) in presented_hash.bytes().zip(expected_hash.bytes()) {
        diff |= a ^ b;
    }
    if diff == 0 {
        // Update last_used_at.
        if let Some(tc) = cfg.trusted_clients.get_mut(&client_id) {
            tc.last_used_at = Some(now_seconds());
        }
        save(&path, &cfg)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Revoke a trusted client. User explicitly removes a device.
#[tauri::command]
pub fn revoke_trusted_client(app: AppHandle, client_id: String) -> Result<(), String> {
    let path = config_path(&app)?;
    let mut cfg = load_from_disk(&path);
    cfg.trusted_clients.remove(&client_id);
    save(&path, &cfg)?;
    Ok(())
}
