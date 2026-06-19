use session_memory_core::{execute::execute_and_index, store::Store};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[tokio::test]
async fn test_execute_small_output_indexed() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");
    let result = execute_and_index(&db_path, "echo hello", "test", DEFAULT_TIMEOUT_MS, None)
        .await
        .unwrap();

    assert_eq!(result.exit_code, 0);
    assert!(
        result.indexed,
        "small output should be indexed for MCP search parity"
    );
    assert!(
        result.summary.contains("hello"),
        "summary should contain command output"
    );
    assert!(result.output_bytes > 0);
}

#[tokio::test]
async fn test_execute_large_output_gets_indexed() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    // Generate >2KB output with a comfortable margin and wider lines.
    let result = execute_and_index(
        &db_path,
        "python3 - <<'PY'
for i in range(600):
    print(f'large-output-line-{i}-abcdefghijklmnopqrstuvwxyz')
PY",
        "seq-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert_eq!(result.exit_code, 0);
    assert!(result.indexed, "output over 2 KB should be indexed");
    assert!(
        result.output_bytes > 2048,
        "output_bytes should exceed threshold"
    );
}

#[tokio::test]
async fn test_execute_nonzero_exit_code() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(&db_path, "exit 42", "fail-test", DEFAULT_TIMEOUT_MS, None)
        .await
        .unwrap();

    assert_eq!(result.exit_code, 42);
}

#[tokio::test]
async fn test_execute_summary_capped() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    // Generate many lines so summary truncation kicks in.
    let result = execute_and_index(
        &db_path,
        "seq 1 1000",
        "long-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    // Summary must not exceed SUMMARY_MAX_CHARS (500).
    assert!(result.summary.len() <= 500);
}

#[tokio::test]
async fn test_execute_indexed_content_searchable() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    // Produce uniquely identifiable large output.
    let result = execute_and_index(
        &db_path,
        "python3 - <<'PY'
for i in range(600):
    print(f'uniquetoken-{i}')
PY",
        "search-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert!(result.indexed, "large output should be indexed");

    // Verify the indexed content is searchable.
    let store = Store::open(&db_path).unwrap();
    let hits = store.search("uniquetoken", 5, None).unwrap();
    assert!(
        !hits.is_empty(),
        "indexed content should be findable via FTS5"
    );
}

#[tokio::test]
async fn test_execute_timeout_returns_failure_summary() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(&db_path, "sleep 2", "timeout-test", 10, None)
        .await
        .unwrap();

    assert_eq!(result.exit_code, 124);
    assert!(result.summary.contains("timed out"));
}

#[tokio::test]
async fn test_execute_preserves_tail_output_after_process_exit() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(
        &db_path,
        "python3 - <<'PY'\nfor i in range(900):\n    print(f'line-{i}')\nprint('TAIL_UNIQUE_TOKEN_12345')\nPY",
        "tail-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert!(result.indexed);
    let store = Store::open(&db_path).unwrap();
    let hits = store
        .search("TAIL_UNIQUE_TOKEN_12345", 5, Some("tail-test"))
        .unwrap();
    assert!(
        !hits.is_empty(),
        "tail token should survive post-exit channel draining"
    );
}

#[tokio::test]
async fn test_execute_replaces_prior_chunks_for_same_label() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let first = execute_and_index(
        &db_path,
        "python3 - <<'PY'
for i in range(600):
    print(f'OLDTOKEN-{i}')
PY",
        "repeat-label",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();
    assert!(first.indexed);

    let second = execute_and_index(
        &db_path,
        "python3 - <<'PY'
for i in range(600):
    print(f'NEWTOKEN-{i}')
PY",
        "repeat-label",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();
    assert!(second.indexed);

    let store = Store::open(&db_path).unwrap();
    let old_hits = store.search("OLDTOKEN", 5, Some("repeat-label")).unwrap();
    let new_hits = store.search("NEWTOKEN", 5, Some("repeat-label")).unwrap();
    assert!(
        old_hits.iter().all(|hit| !hit.content.contains("OLDTOKEN")),
        "old chunks should be cleared when the label is reused"
    );
    assert!(
        !new_hits.is_empty(),
        "new chunks should remain searchable for the reused label"
    );
}

#[tokio::test]
async fn test_execute_indexes_only_first_mib_but_tracks_total_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(
        &db_path,
        "python3 - <<'PY'\nimport sys\nsys.stdout.write('A' * (1024 * 1024 + 4096))\nsys.stdout.write('TAIL_AFTER_CAP_TOKEN')\nPY",
        "cap-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert_eq!(result.exit_code, 0);
    assert!(result.output_bytes > 1024 * 1024);
    assert!(result.indexed);

    let store = Store::open(&db_path).unwrap();
    let tail_hits = store
        .search("TAIL_AFTER_CAP_TOKEN", 5, Some("cap-test"))
        .unwrap();
    assert!(
        tail_hits.is_empty(),
        "bytes after the 1MiB indexed-output cap must not be indexed"
    );
}

#[tokio::test]
async fn test_execute_preserves_utf8_split_across_stream_chunks() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(
        &db_path,
        "python3 - <<'PY'\nimport sys\nfor _ in range(9000):\n    sys.stdout.write('é')\nsys.stdout.write(' UTF8_SPLIT_TOKEN')\nPY",
        "utf8-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert_eq!(result.exit_code, 0);
    let store = Store::open(&db_path).unwrap();
    let hits = store
        .search("UTF8_SPLIT_TOKEN", 5, Some("utf8-test"))
        .unwrap();
    assert!(!hits.is_empty());
    assert!(
        hits.iter().all(|hit| !hit.content.contains('�')),
        "incremental UTF-8 decoding should not inject replacement chars at chunk boundaries"
    );
}

#[tokio::test]
async fn test_execute_summary_matches_typescript_fallback_shape() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(
        &db_path,
        "printf '\n  line one  \nline two\nline three\nline four\nline five\nline six\nline seven\n'",
        "summary-parity-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert_eq!(result.exit_code, 0);
    assert_eq!(
        result.summary,
        "line one\nline two\nline three\nline four\nline five\nline six"
    );
    assert!(!result.truncated);
}

#[tokio::test]
async fn test_execute_summary_reports_no_output_for_empty_success() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(
        &db_path,
        "true",
        "empty-summary-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert_eq!(result.exit_code, 0);
    assert_eq!(result.summary, "no output");
    assert!(!result.indexed);
    assert_eq!(result.captured_bytes, 0);
}

#[tokio::test]
async fn test_execute_unbounded_output_caps_indexed_bytes_and_persists_truncation_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");

    let result = execute_and_index(
        &db_path,
        "python3 - <<'PY'\nimport sys\nsys.stdout.write('A' * (1024 * 1024 + 4096))\nsys.stdout.write('TAIL_AFTER_CAP_TOKEN')\nPY",
        "metadata-cap-test",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();

    assert_eq!(result.exit_code, 0);
    assert!(result.output_bytes > 1024 * 1024);
    assert_eq!(result.captured_bytes, 1024 * 1024);
    assert_eq!(result.max_capture_bytes, 1024 * 1024);
    assert!(result.truncated);
    assert!(
        result
            .summary
            .contains("[output truncated before indexing]")
    );

    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let metadata_json: String = conn
        .query_row(
            "SELECT metadata_json FROM session_memory_chunks WHERE source = ?1 LIMIT 1",
            rusqlite::params!["metadata-cap-test"],
            |row| row.get(0),
        )
        .unwrap();
    let metadata: serde_json::Value = serde_json::from_str(&metadata_json).unwrap();
    assert_eq!(metadata["executionBackend"], "native");
    assert_eq!(metadata["truncated"], true);
    assert_eq!(
        metadata["outputBytes"].as_u64().unwrap(),
        result.output_bytes
    );
    assert_eq!(metadata["capturedBytes"], 1024 * 1024);
    assert_eq!(metadata["maxCaptureBytes"], 1024 * 1024);
}
