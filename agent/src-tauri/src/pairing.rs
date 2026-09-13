//! Pairing code generation.
//!
//! The host mints the code locally from a friendly alphabet and opens a
//! WebSocket to `/ws/{code}`; the claiming client connects to the same room.
//! Length is user-configurable — see [`crate::config::AgentConfig::pairing_code_len`].
//!
//! The signaling Worker only rejects an empty room key or one longer than 128
//! chars (`signaling/src/index.ts`), so that is the hard ceiling here.

use rand::seq::SliceRandom;
use tauri::AppHandle;

use crate::config;

/// Excludes 0/1/i/l/o so a code read off a screen can't be mistyped.
const ALPHABET: &[u8] = b"23456789abcdefghjkmnpqrstuvwxyz";

/// Shortest code we will generate — the upstream fixed length, kept as the
/// floor so this fork can still reproduce upstream behaviour. Note that 6 chars
/// is only ~30 bits, and no rate limiting was found in the signaling code to
/// slow a guesser down (see `docs/PROTOCOL.md`); prefer [`DEFAULT_CODE_LEN`].
pub const MIN_CODE_LEN: usize = 6;

/// Longest code we will generate; matches the signaling Worker's room-key cap.
pub const MAX_CODE_LEN: usize = 128;

/// Used when the config carries no explicit preference.
pub const DEFAULT_CODE_LEN: usize = 16;

/// Clamp a requested length into the range we're willing to generate.
pub fn clamp_code_len(len: usize) -> usize {
    len.clamp(MIN_CODE_LEN, MAX_CODE_LEN)
}

/// Generate a random code of exactly `len` characters drawn from [`ALPHABET`].
pub fn generate_code(len: usize) -> String {
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| *ALPHABET.choose(&mut rng).expect("alphabet non-empty") as char)
        .collect()
}

/// Mint a fresh pairing code at the user's configured length.
///
/// Called once per "Add a new device" click, so every pairing gets a new code;
/// the caller drops it again as soon as the pair connection closes.
#[tauri::command]
pub fn request_pairing_code(app: AppHandle) -> Result<String, String> {
    let len = clamp_code_len(config::pairing_code_len(&app)?);
    Ok(generate_code(len))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_code_shape() {
        let c = generate_code(DEFAULT_CODE_LEN);
        assert_eq!(c.len(), DEFAULT_CODE_LEN);
        assert!(c.chars().all(|ch| ALPHABET.contains(&(ch as u8))));
    }

    #[test]
    fn codes_differ_between_calls() {
        // Not a guarantee, but with 31^16 possibilities a collision here means
        // the RNG is broken.
        assert_ne!(generate_code(DEFAULT_CODE_LEN), generate_code(DEFAULT_CODE_LEN));
    }

    #[test]
    fn clamp_bounds_requested_lengths() {
        assert_eq!(clamp_code_len(0), MIN_CODE_LEN);
        assert_eq!(clamp_code_len(MIN_CODE_LEN), MIN_CODE_LEN);
        assert_eq!(clamp_code_len(99_999), MAX_CODE_LEN);
        assert_eq!(clamp_code_len(DEFAULT_CODE_LEN), DEFAULT_CODE_LEN);
    }
}
