//! Streaming command execution with automatic FTS5 indexing.
//!
//! Runs a shell command with stdout + stderr merged into bounded in-memory
//! chunks. Chunks are flushed into the store once accumulated bytes exceed
//! `SANDBOX_THRESHOLD`; any remaining non-empty output is flushed when the
//! command exits so small command output is searchable too.
//!
//! Designed so raw output never has to sit in memory as one giant string.

use std::path::Path;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::{Duration, Instant};

use crate::store::{Store, StoreResult};

/// Bytes that trigger an indexed flush.
const SANDBOX_THRESHOLD: usize = 2048;
/// Max chars kept in the returned summary.
const SUMMARY_MAX_CHARS: usize = 500;
/// Result returned by [`execute_and_index`].
#[derive(Debug)]
pub struct ExecuteResult {
    /// Shell exit code (−1 if the process was killed without a code).
    pub exit_code: i32,
    /// Total bytes streamed from stdout + stderr.
    pub output_bytes: usize,
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
    let mut total_bytes: usize = 0;
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
                total_bytes += chunk.len();
                let text = String::from_utf8_lossy(&chunk);
                if summary.chars().count() < SUMMARY_MAX_CHARS {
                    let remaining = SUMMARY_MAX_CHARS - summary.chars().count();
                    summary.extend(text.chars().take(remaining));
                }
                accumulated.push_str(&text);

                if accumulated.len() > SANDBOX_THRESHOLD {
                    store.append(label, &accumulated)?;
                    indexed = true;
                    accumulated.clear();
                }
            }
            status = child.wait(), if exit_code.is_none() => {
                let status = status.map_err(crate::store::StoreError::Io)?;
                exit_code = Some(status.code().unwrap_or(-1));
                continue;
            }
            _ = &mut timeout, if exit_code.is_none() => {
                timed_out = true;
                let _ = child.start_kill();
                let status = child.wait().await.map_err(crate::store::StoreError::Io)?;
                exit_code = Some(status.code().unwrap_or(-1));
                continue;
            }
        }
    }

    let _ = stdout_task.await;
    let _ = stderr_task.await;

    // Flush any remaining non-empty buffer so small command output is indexed
    // and queryable through the shared session-memory schema.
    if !accumulated.is_empty() {
        store.append(label, &accumulated)?;
        indexed = true;
    }

    Ok(ExecuteResult {
        exit_code: if timed_out {
            -1
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
