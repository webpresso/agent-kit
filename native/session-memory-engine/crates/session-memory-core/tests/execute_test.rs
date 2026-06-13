use session_memory_core::{execute::execute_and_index, store::Store};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[tokio::test]
async fn test_execute_small_output_not_indexed() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db");
    let result = execute_and_index(&db_path, "echo hello", "test", DEFAULT_TIMEOUT_MS, None)
        .await
        .unwrap();

    assert_eq!(result.exit_code, 0);
    assert!(!result.indexed, "small output should not be indexed");
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
        "seq 1 600 | xargs -I{} echo 'large-output-line-{}-abcdefghijklmnopqrstuvwxyz'",
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
        "seq 1 600 | xargs -I{} echo 'uniquetoken-{}'",
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

    assert_eq!(result.exit_code, -1);
    assert!(result.summary.contains("timeout"));
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
        "seq 1 600 | xargs -I{} echo 'OLDTOKEN-{}'",
        "repeat-label",
        DEFAULT_TIMEOUT_MS,
        None,
    )
    .await
    .unwrap();
    assert!(first.indexed);

    let second = execute_and_index(
        &db_path,
        "seq 1 600 | xargs -I{} echo 'NEWTOKEN-{}'",
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
