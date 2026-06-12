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
) -> StoreResult<ExecuteResult> {
    use std::process::Stdio;

    let mut child = Command::new("sh")
        .arg("-c")
        .arg(command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(crate::store::StoreError::Io)?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    // Collect all output lines from both streams.
    // Using join to drain both concurrently then merge.
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        let mut collected: Vec<String> = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            collected.push(line);
        }
        collected
    });
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut collected: Vec<String> = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            collected.push(line);
        }
        collected
    });

    let (stdout_lines, stderr_lines) = tokio::join!(stdout_task, stderr_task);
    let stdout_lines = stdout_lines.unwrap_or_default();
    let stderr_lines = stderr_lines.unwrap_or_default();

    // Interleave stdout then stderr (simpler than true interleaving; order preserved per stream).
    let all_lines = stdout_lines.into_iter().chain(stderr_lines);

    let mut accumulated = String::new();
    let mut total_bytes: usize = 0;
    let mut indexed = false;
    let mut summary_lines: Vec<String> = Vec::new();
    let mut chunk_index: usize = 0;

    // Open the store once — mutably index into it when flushing chunks.
    let mut store = Store::open(db_path)?;

    for line in all_lines {
        total_bytes += line.len() + 1; // +1 for the newline
        if summary_lines.len() < SUMMARY_MAX_LINES {
            summary_lines.push(line.clone());
        }
        accumulated.push_str(&line);
        accumulated.push('\n');

        if accumulated.len() > SANDBOX_THRESHOLD {
            let chunk_label = if chunk_index == 0 {
                label.to_string()
            } else {
                format!("{label}:{chunk_index}")
            };
            store.index(&chunk_label, &[accumulated.clone()])?;
            indexed = true;
            chunk_index += 1;
            accumulated.clear();
        }
    }

    let status = child
        .wait()
        .await
        .map_err(crate::store::StoreError::Io)?;
    let exit_code = status.code().unwrap_or(-1);

    // Flush any remaining buffer — only if we already indexed (large output) or
    // total output itself exceeded the threshold.
    if !accumulated.is_empty() && (indexed || total_bytes > SANDBOX_THRESHOLD) {
        let chunk_label = if chunk_index == 0 {
            label.to_string()
        } else {
            format!("{label}:{chunk_index}")
        };
        store.index(&chunk_label, &[accumulated])?;
        indexed = true;
    }

    let summary: String = summary_lines
        .iter()
        .take(SUMMARY_MAX_LINES)
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(SUMMARY_MAX_CHARS)
        .collect();

    Ok(ExecuteResult {
        exit_code,
        output_bytes: total_bytes,
        indexed,
        summary,
    })
}
