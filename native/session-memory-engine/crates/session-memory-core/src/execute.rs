//! Streaming command execution with automatic FTS5 indexing.
//!
//! Runs a shell command with stdout + stderr merged into bounded in-memory
//! chunks. Chunks are flushed into the store once accumulated bytes exceed
//! `SANDBOX_THRESHOLD`; any remaining non-empty output is flushed when the
//! command exits so small command output is searchable too.
//!
//! Designed so raw output never has to sit in memory as one giant string.

use std::path::Path;
use std::process::ExitStatus;

use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::{Duration, Instant};

use crate::store::{Store, StoreResult};

/// Bytes that trigger an indexed flush.
const SANDBOX_THRESHOLD: usize = 2048;
/// Max bytes of command output indexed into SQLite/FTS per execution.
pub const INDEXED_OUTPUT_CAP_BYTES: u64 = 1024 * 1024;
/// Max chars kept in the returned summary.
const SUMMARY_MAX_CHARS: usize = 500;
/// Result returned by [`execute_and_index`].
#[derive(Debug)]
pub struct ExecuteResult {
    /// Shell exit code (−1 if the process was killed without a code).
    pub exit_code: i32,
    /// Total bytes streamed from stdout + stderr.
    pub output_bytes: u64,
    /// Whether any content was indexed into FTS5.
    pub indexed: bool,
    /// First output text, truncated to `SUMMARY_MAX_CHARS`.
    pub summary: String,
}

fn spawn_reader<R>(mut reader: R, tx: mpsc::UnboundedSender<Vec<u8>>) -> tokio::task::JoinHandle<()>
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut buffer = vec![0; 8192];
        loop {
            match reader.read(&mut buffer).await {
                Ok(0) => break,
                Ok(n) => {
                    if tx.send(buffer[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    })
}

/// Run a shell command and index output into the FTS5 store at `db_path`.
///
/// Streams stdout and stderr in chunks so the full output is never held in
/// memory at once. Chunks are flushed and cleared as they exceed the threshold;
/// the final non-empty buffer is also indexed so small output remains searchable.
///
/// Returns a compact [`ExecuteResult`]; raw output never escapes this function.
pub async fn execute_and_index(
    db_path: &Path,
    command: &str,
    label: &str,
    timeout_ms: u64,
    cwd: Option<&Path>,
) -> StoreResult<ExecuteResult> {
    use std::process::Stdio;

    let mut child_cmd = Command::new("sh");
    child_cmd
        .arg("-c")
        .arg(command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = cwd {
        child_cmd.current_dir(dir);
    }
    let mut child = child_cmd.spawn().map_err(crate::store::StoreError::Io)?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let stdout_task = spawn_reader(stdout, tx.clone());
    let stderr_task = spawn_reader(stderr, tx.clone());
    drop(tx);

    let mut accumulated = String::new();
    let mut pending_utf8 = Vec::<u8>::new();
    let mut total_bytes: u64 = 0;
    let mut indexed_bytes: u64 = 0;
    let mut indexed = false;
    let mut summary = String::new();
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let timeout = tokio::time::sleep_until(deadline);
    tokio::pin!(timeout);

    // Open the store once — mutably index into it when flushing chunks.
    let mut store = Store::open(db_path)?;
    store.clear(label)?;
    let mut timed_out = false;
    let mut exit_code = None;

    loop {
        tokio::select! {
            maybe_chunk = rx.recv() => {
                let Some(chunk) = maybe_chunk else {
                    if exit_code.is_some() {
                        break;
                    }
                    continue;
                };
                total_bytes = total_bytes.saturating_add(chunk.len() as u64);
                let text = decode_incremental_utf8(&mut pending_utf8, &chunk, false);
                if summary.chars().count() < SUMMARY_MAX_CHARS {
                    let remaining = SUMMARY_MAX_CHARS - summary.chars().count();
                    summary.extend(text.chars().take(remaining));
                }
                append_indexable_text(&mut accumulated, &text, &mut indexed_bytes);

                if accumulated.len() > SANDBOX_THRESHOLD {
                    store.append(label, &accumulated)?;
                    indexed = true;
                    accumulated.clear();
                }
            }
            status = child.wait(), if exit_code.is_none() => {
                let status = status.map_err(crate::store::StoreError::Io)?;
                exit_code = Some(exit_code_from_status(status));
                continue;
            }
            _ = &mut timeout, if exit_code.is_none() => {
                timed_out = true;
                let _ = child.start_kill();
                let _ = child.wait().await.map_err(crate::store::StoreError::Io)?;
                exit_code = Some(124);
                continue;
            }
        }
    }

    let _ = stdout_task.await;
    let _ = stderr_task.await;

    let text = decode_incremental_utf8(&mut pending_utf8, &[], true);
    if summary.chars().count() < SUMMARY_MAX_CHARS {
        let remaining = SUMMARY_MAX_CHARS - summary.chars().count();
        summary.extend(text.chars().take(remaining));
    }
    append_indexable_text(&mut accumulated, &text, &mut indexed_bytes);

    // Flush any remaining non-empty buffer so small command output is indexed
    // and queryable through the shared session-memory schema.
    if !accumulated.is_empty() {
        store.append(label, &accumulated)?;
        indexed = true;
    }

    Ok(ExecuteResult {
        exit_code: if timed_out {
            124
        } else {
            exit_code.unwrap_or(-1)
        },
        output_bytes: total_bytes,
        indexed,
        summary: if timed_out {
            if summary.is_empty() {
                "[timeout] command exceeded execution budget".to_string()
            } else {
                format!("[timeout] {summary}")
            }
        } else {
            summary
        },
    })
}

fn append_indexable_text(accumulated: &mut String, text: &str, indexed_bytes: &mut u64) {
    if text.is_empty() || *indexed_bytes >= INDEXED_OUTPUT_CAP_BYTES {
        return;
    }
    let remaining = (INDEXED_OUTPUT_CAP_BYTES - *indexed_bytes) as usize;
    let capped = utf8_prefix_at_most(text, remaining);
    accumulated.push_str(capped);
    *indexed_bytes += capped.len() as u64;
}

fn utf8_prefix_at_most(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

fn decode_incremental_utf8(pending: &mut Vec<u8>, chunk: &[u8], final_flush: bool) -> String {
    pending.extend_from_slice(chunk);
    let mut out = String::new();

    loop {
        match std::str::from_utf8(pending) {
            Ok(valid) => {
                out.push_str(valid);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                if valid_up_to > 0 {
                    let valid = std::str::from_utf8(&pending[..valid_up_to])
                        .expect("valid_up_to must split at UTF-8 boundary");
                    out.push_str(valid);
                    pending.drain(..valid_up_to);
                    continue;
                }
                if let Some(error_len) = error.error_len() {
                    let replacement_end = error_len.min(pending.len());
                    out.push_str(&String::from_utf8_lossy(&pending[..replacement_end]));
                    pending.drain(..replacement_end);
                    continue;
                }
                if final_flush {
                    out.push_str(&String::from_utf8_lossy(pending));
                    pending.clear();
                }
                break;
            }
        }
    }

    out
}

fn exit_code_from_status(status: ExitStatus) -> i32 {
    if let Some(code) = status.code() {
        return code;
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(signal) = status.signal() {
            return 128 + signal;
        }
    }

    -1
}
