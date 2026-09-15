//! Receiving files pushed from a paired client.
//!
//! The client streams a file over the `files` DataChannel in 16 KiB chunks. The
//! WebView forwards each chunk here; this module owns the open file handle, the
//! running SHA-256, and the byte counter, so file *contents* never accumulate in
//! either the WebView or a single IPC payload — memory stays flat regardless of
//! how large the file is.
//!
//! ## Why base64 on the IPC boundary
//!
//! Tauri 2 has a zero-copy path: a top-level `Uint8Array` argument arrives as
//! `application/octet-stream` and lands in `tauri::ipc::Request::body()` as
//! `InvokeBody::Raw`. We deliberately do *not* use it. That path is reported to
//! be unavailable on Linux (wry#666 — webkit2gtk historically could not carry a
//! request body), and the published Tauri versions that changed this could not be
//! confirmed against the shipped webkit2gtk from here. Shipping a transfer that
//! silently fails on one platform is worse than paying for the encoding: base64
//! costs ~33% inflation plus one decode per 16 KiB chunk, measured at ~50–100 ms
//! of extra CPU across a 64 MiB transfer — against a transfer that takes tens of
//! seconds. Revisit if that ever shows up in a profile.
//!
//! A **worse** trap to avoid: passing a `Uint8Array` nested inside an argument
//! object gets JSON-stringified into an array of numbers (6 MB → 22.5 MB of text,
//! ~1.8 s of blocked main thread). Never send byte arrays through the JSON path.
//!
//! ## Crash safety
//!
//! Bytes land in a `.frd-part-*` file that is renamed into place only after
//! `sync_all()`. An interrupted transfer therefore never leaves behind a file
//! that looks complete but is truncated — the single worst outcome for a file
//! transfer. Stale part files are swept on the next launch.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// Default ceiling for a single file. Large enough for anything a person moves
/// by hand; the limit exists to bound *disk usage and time*, not memory, since
/// the write is streamed.
pub const DEFAULT_MAX_TRANSFER_BYTES: u64 = 512 * 1024 * 1024;

/// A config value below this is almost certainly a mistake; clamp up to 1 MiB
/// rather than silently disabling transfers.
const MIN_MAX_TRANSFER_BYTES: u64 = 1024 * 1024;

/// Clamp a configured ceiling into a sane range.
pub fn clamp_max_transfer_bytes(n: u64) -> u64 {
    n.clamp(MIN_MAX_TRANSFER_BYTES, u64::MAX / 2)
}

/// Subdirectory of the user's downloads folder that received files land in.
const RECEIVE_DIR: &str = "FreeRemoteDesk";

/// Prefix for in-flight files. Also what the stale-file sweep looks for.
const PART_PREFIX: &str = ".frd-part-";

/// Longest filename we will write, in bytes. Leaves room for the directory path
/// and a ` (99)` suffix under both ext4's 255-byte and Windows' 260-char limits.
const MAX_NAME_BYTES: usize = 180;

/// An extension longer than this is almost certainly not an extension.
const MAX_EXT_CHARS: usize = 16;

/// Windows resolves these names in every directory, with or without an
/// extension (`con.txt` is still the console device).
const RESERVED_NAMES: [&str; 24] = [
    "CON", "PRN", "AUX", "NUL", "COM0", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
    "COM8", "COM9", "LPT0", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
    "LPT9",
];

/// One in-flight inbound transfer. Held for the whole transfer so the handle
/// never crosses the IPC boundary.
struct Inbound {
    final_path: PathBuf,
    part_path: PathBuf,
    file: File,
    hasher: Sha256,
    declared: u64,
    written: u64,
}

/// Only one transfer at a time. Mirrors `input.rs`'s `static ENIGO` pattern.
static ACTIVE: Mutex<Option<Inbound>> = Mutex::new(None);

#[derive(Debug, Serialize)]
pub struct FileBegin {
    /// The sanitized, de-collided name the file will have on disk. The client
    /// shows this back to the user, so it must be the real one.
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct FileDone {
    pub name: String,
    /// Absolute path on this machine.
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
}

fn now_seconds() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Where received files go. `download_dir()` can fail on a Linux box with no
/// XDG user dirs configured, so fall back to the home directory and then to the
/// app data dir rather than failing the transfer.
fn receive_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("no writable directory available: {e}"))?;
    let dir = base.join(RECEIVE_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

fn is_forbidden(c: char) -> bool {
    c.is_control()
        || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        // Bidi overrides: `photo\u{202E}gnp.exe` renders as `photoexe.png` in a
        // file manager. Strip them rather than trust the display.
        || matches!(c, '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{200E}' | '\u{200F}')
}

/// Split `name` into (stem, extension) where the extension includes its dot and
/// is only treated as one if it is short enough to plausibly be one.
fn split_extension(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 && name.len() - i - 1 <= MAX_EXT_CHARS => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

fn trim_trailing_dots_and_spaces(s: &str) -> &str {
    s.trim_end_matches(|c| c == '.' || c == ' ')
}

/// Turn a peer-supplied name into something safe to write.
///
/// Step order matters: truncation can expose a trailing dot and scrubbing can
/// produce a reserved name, so each check runs on the result of the previous.
pub fn sanitize_filename(raw: &str) -> String {
    // 1. basename only — `..\..\evil.exe` becomes `evil.exe`
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");

    // 2. scrub forbidden characters
    let scrubbed: String = base.chars().map(|c| if is_forbidden(c) { '_' } else { c }).collect();

    // 3. trim surrounding whitespace and trailing dots. A *leading* dot is kept:
    //    `.env` and `.gitignore` are legitimate names.
    let trimmed = trim_trailing_dots_and_spaces(scrubbed.trim());

    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return format!("transfer-{}", now_seconds());
    }

    // 4. truncate on a char boundary, preserving a plausible extension
    let mut name = if trimmed.len() <= MAX_NAME_BYTES {
        trimmed.to_string()
    } else {
        let (stem, ext) = split_extension(trimmed);
        let budget = MAX_NAME_BYTES.saturating_sub(ext.len());
        let mut cut = budget.min(stem.len());
        while cut > 0 && !stem.is_char_boundary(cut) {
            cut -= 1;
        }
        let truncated = format!("{}{}", &stem[..cut], ext);
        trim_trailing_dots_and_spaces(&truncated).to_string()
    };

    if name.is_empty() {
        return format!("transfer-{}", now_seconds());
    }

    // 5. Windows reserved device names, extension ignored
    let stem_upper = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if RESERVED_NAMES.contains(&stem_upper.as_str()) {
        name.insert(0, '_');
    }

    name
}

/// Pick a path that doesn't exist yet: `name.ext`, `name (1).ext`, …
///
/// Case-insensitive filesystems need no special handling — `Path::exists()` is
/// already case-insensitive there.
fn de_collide(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = split_extension(name);
    for n in 1..=99u32 {
        let candidate = dir.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}-{}{ext}", now_seconds()))
}

/// Best-effort cleanup of part files left behind by a crash. Called once at
/// startup; failures are ignored because a stale part file is harmless.
pub fn sweep_stale_parts(app: &AppHandle) {
    let Ok(dir) = receive_dir(app) else { return };
    let Ok(entries) = fs::read_dir(&dir) else { return };
    let cutoff = now_seconds() - 24 * 60 * 60;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !name.starts_with(PART_PREFIX) {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| (d.as_secs() as i64) < cutoff)
            .unwrap_or(false);
        if stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Open a transfer. Rejects a second concurrent transfer rather than
/// interleaving two files into one buffer.
#[tauri::command]
pub fn begin_file_receive(app: AppHandle, name: String, size: u64) -> Result<FileBegin, String> {
    let limit = crate::config::max_transfer_bytes(&app);
    if size > limit {
        return Err(format!("too_large:{size}:{limit}"));
    }

    let mut slot = ACTIVE.lock().map_err(|_| "receiver poisoned".to_string())?;
    if slot.is_some() {
        return Err("busy".to_string());
    }

    let dir = receive_dir(&app)?;
    let safe = sanitize_filename(&name);
    let final_path = de_collide(&dir, &safe);
    let final_name = final_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&safe)
        .to_string();

    // `create_new` so we never clobber something that appeared between the
    // de-collide check and now.
    let part_path = dir.join(format!("{PART_PREFIX}{}", crate::config::uuid_hex()));
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&part_path)
        .map_err(|e| format!("create part file: {e}"))?;

    *slot = Some(Inbound {
        final_path,
        part_path,
        file,
        hasher: Sha256::new(),
        declared: size,
        written: 0,
    });

    Ok(FileBegin {
        name: final_name,
        size,
    })
}

/// Append one chunk. The argument is base64 — see the module docs for why.
#[tauri::command]
pub async fn write_file_chunk(data_base64: String) -> Result<(), String> {
    let bytes = BASE64
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("bad base64: {e}"))?;
    // Writes are buffered and short, but they are still blocking syscalls; keep
    // them off the async runtime so a slow disk can't stall other commands.
    tokio::task::spawn_blocking(move || write_chunk(&bytes))
        .await
        .map_err(|e| format!("write task: {e}"))?
}

fn write_chunk(bytes: &[u8]) -> Result<(), String> {
    let mut slot = ACTIVE.lock().map_err(|_| "receiver poisoned".to_string())?;
    let inbound = slot.as_mut().ok_or_else(|| "no transfer in progress".to_string())?;

    // The declared size is the write bound: this is what stops a buggy or
    // hostile peer from filling the disk.
    if inbound.written + bytes.len() as u64 > inbound.declared {
        return Err("too_large".to_string());
    }

    inbound
        .file
        .write_all(bytes)
        .map_err(|e| format!("write: {e}"))?;
    inbound.hasher.update(bytes);
    inbound.written += bytes.len() as u64;
    Ok(())
}

/// Finish a transfer: flush, fsync, and move the part file into place.
#[tauri::command]
pub fn end_file_receive() -> Result<FileDone, String> {
    let inbound = ACTIVE
        .lock()
        .map_err(|_| "receiver poisoned".to_string())?
        .take()
        .ok_or_else(|| "no transfer in progress".to_string())?;

    let Inbound {
        final_path,
        part_path,
        mut file,
        hasher,
        declared,
        written,
    } = inbound;

    // Drop the handle before renaming — Windows refuses to rename an open file.
    file.flush().map_err(|e| format!("flush: {e}"))?;
    file.sync_all().map_err(|e| format!("sync: {e}"))?;
    drop(file);

    if written != declared {
        let _ = fs::remove_file(&part_path);
        return Err(format!("incomplete:{written}:{declared}"));
    }

    // A same-named file may have appeared during the transfer. On Unix the
    // rename would silently clobber it, so re-check immediately before.
    let target = if final_path.exists() {
        let dir = final_path.parent().unwrap_or(Path::new("."));
        let name = final_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("transfer");
        de_collide(dir, name)
    } else {
        final_path
    };

    fs::rename(&part_path, &target).map_err(|e| format!("rename: {e}"))?;

    Ok(FileDone {
        name: target
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string(),
        path: target.display().to_string(),
        bytes: written,
        sha256: format!("{:x}", hasher.finalize()),
    })
}

/// Abandon a transfer and delete the partial file. Safe to call when nothing is
/// in progress — the client may abort after we already finished.
#[tauri::command]
pub fn abort_file_receive() -> Result<(), String> {
    let inbound = ACTIVE
        .lock()
        .map_err(|_| "receiver poisoned".to_string())?
        .take();
    if let Some(inbound) = inbound {
        drop(inbound.file);
        let _ = fs::remove_file(&inbound.part_path);
    }
    Ok(())
}

/// The directory received files land in, for display in the UI.
#[tauri::command]
pub fn receive_directory(app: AppHandle) -> Result<String, String> {
    Ok(receive_dir(&app)?.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_path_components() {
        assert_eq!(sanitize_filename("..\\..\\evil.exe"), "evil.exe");
        assert_eq!(sanitize_filename("/etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("a/b/c.txt"), "c.txt");
    }

    #[test]
    fn rejects_traversal_only_names() {
        assert!(sanitize_filename("..").starts_with("transfer-"));
        assert!(sanitize_filename(".").starts_with("transfer-"));
        assert!(sanitize_filename("").starts_with("transfer-"));
        assert!(sanitize_filename("dir/").starts_with("transfer-"));
    }

    #[test]
    fn scrubs_forbidden_characters() {
        assert_eq!(sanitize_filename("a<b>c:d\"e|f?g*h.txt"), "a_b_c_d_e_f_g_h.txt");
        assert_eq!(sanitize_filename("tab\there.txt"), "tab_here.txt");
    }

    #[test]
    fn strips_bidi_overrides() {
        // Renders as "photoexe.png" in a file manager without this.
        let hostile = "photo\u{202E}gnp.exe";
        let safe = sanitize_filename(hostile);
        assert!(!safe.contains('\u{202E}'));
        assert_eq!(safe, "photo_gnp.exe");
    }

    #[test]
    fn keeps_leading_dot_but_drops_trailing() {
        assert_eq!(sanitize_filename(".env"), ".env");
        assert_eq!(sanitize_filename(".gitignore"), ".gitignore");
        assert_eq!(sanitize_filename("weird.txt."), "weird.txt");
        assert_eq!(sanitize_filename("trailing   "), "trailing");
    }

    #[test]
    fn escapes_windows_reserved_names() {
        assert_eq!(sanitize_filename("CON"), "_CON");
        assert_eq!(sanitize_filename("con.txt"), "_con.txt");
        assert_eq!(sanitize_filename("COM1.log"), "_COM1.log");
        assert_eq!(sanitize_filename("nul"), "_nul");
        // Not reserved — only the exact stem matters.
        assert_eq!(sanitize_filename("console.txt"), "console.txt");
    }

    #[test]
    fn truncates_long_names_but_keeps_extension() {
        let long = format!("{}.txt", "a".repeat(400));
        let safe = sanitize_filename(&long);
        assert!(safe.len() <= MAX_NAME_BYTES, "got {} bytes", safe.len());
        assert!(safe.ends_with(".txt"));

        // Multi-byte characters must not be cut mid-character.
        let cjk = format!("{}.log", "中".repeat(200));
        let safe = sanitize_filename(&cjk);
        assert!(safe.len() <= MAX_NAME_BYTES);
        assert!(safe.ends_with(".log"));
    }

    #[test]
    fn de_collide_avoids_existing_files() {
        let dir = std::env::temp_dir().join(format!("frd-test-{}", crate::config::uuid_hex()));
        fs::create_dir_all(&dir).unwrap();

        assert_eq!(de_collide(&dir, "a.txt"), dir.join("a.txt"));

        File::create(dir.join("a.txt")).unwrap();
        assert_eq!(de_collide(&dir, "a.txt"), dir.join("a (1).txt"));

        File::create(dir.join("a (1).txt")).unwrap();
        assert_eq!(de_collide(&dir, "a.txt"), dir.join("a (2).txt"));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn clamps_configured_ceiling() {
        assert_eq!(clamp_max_transfer_bytes(0), MIN_MAX_TRANSFER_BYTES);
        assert_eq!(clamp_max_transfer_bytes(1), MIN_MAX_TRANSFER_BYTES);
        assert_eq!(
            clamp_max_transfer_bytes(DEFAULT_MAX_TRANSFER_BYTES),
            DEFAULT_MAX_TRANSFER_BYTES
        );
        assert_eq!(clamp_max_transfer_bytes(u64::MAX), u64::MAX / 2);
    }
}
