//! Streaming command execution with automatic FTS5 indexing for large output.
//!
//! Runs a shell command line-by-line (stdout + stderr merged), accumulates
//! content in memory chunks. When accumulated bytes exceed `SANDBOX_THRESHOLD`,
//! the chunk is flushed into the FTS5 store and the buffer is cleared.
//! Output ≤ threshold is **never indexed** — it is returned only as a summary.
//!
//! Designed so raw output never has to sit in memory as one giant string.

use std::path::Path;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::{Duration, Instant};

use crate::store::{Store, StoreResult};

/// Bytes that trigger an indexed flush.
const SANDBOX_THRESHOLD: usize = 2048;
/// Max chars kept in the returned summary.
const SUMMARY_MAX_CHARS: usize = 500;
/// Max lines to retain for the summary.
const SUMMARY_MAX_LINES: usize = 20;

/// Result returned by [`execute_and_index`].
#[derive(Debug)]
pub struct ExecuteResult {
    /// Shell exit code (−1 if the process was killed without a code).
    pub exit_code: i32,
    /// Total bytes streamed from stdout + stderr.
    pub output_bytes: usize,
    /// Whether any content was indexed into FTS5.
    pub indexed: bool,
    /// First ≤ `SUMMARY_MAX_LINES` lines, truncated to `SUMMARY_MAX_CHARS`.
    pub summary: String,
}

/// Run a shell command and index output that exceeds `SANDBOX_THRESHOLD` bytes
/// into the FTS5 store at `db_path`.
///
/// Streams stdout and stderr line-by-line so the full output is never held in
/// memory at once. Chunks are flushed and cleared as they exceed the threshold.
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

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let stdout_task = {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(line).is_err() {
                    break;
                }
            }
        })
    };
    let stderr_task = {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(line).is_err() {
                    break;
                }
            }
        })
    };
    drop(tx);

    let mut accumulated = String::new();
    let mut total_bytes: usize = 0;
    let mut indexed = false;
    let mut summary_lines: Vec<String> = Vec::new();
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
            maybe_line = rx.recv() => {
                let Some(line) = maybe_line else {
                    if exit_code.is_some() {
                        break;
                    }
                    continue;
                };
                total_bytes += line.len() + 1; // +1 for the newline
                if summary_lines.len() < SUMMARY_MAX_LINES {
                    summary_lines.push(line.clone());
                }
                accumulated.push_str(&line);
                accumulated.push('\n');

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

    // Flush any remaining buffer — only if we already indexed (large output) or
    // total output itself exceeded the threshold.
    if !accumulated.is_empty() && (indexed || total_bytes > SANDBOX_THRESHOLD) {
        store.append(label, &accumulated)?;
        indexed = true;
    }

    let full_output = summary_lines.join("\n");
    let summary: String = if indexed {
        full_output.chars().take(SUMMARY_MAX_CHARS).collect()
    } else {
        full_output
    };

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
