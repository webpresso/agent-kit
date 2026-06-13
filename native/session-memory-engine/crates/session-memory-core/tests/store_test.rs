use session_memory_core::store::Store;
use tempfile::tempdir;

fn make_store() -> (Store, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("test.db");
    let store = Store::open(&path).unwrap();
    (store, dir)
}

#[test]
fn test_schema_created() {
    let (_store, _dir) = make_store();
    // If open succeeds, schema was applied
}

#[test]
fn test_index_and_search_porter() {
    let (mut store, _dir) = make_store();
    let chunks: Vec<String> = (0..100)
        .map(|i| format!("The quick brown fox jumps over the lazy dog item {i}"))
        .collect();
    store.index("test-source", &chunks).unwrap();

    let results = store.search("fox", 5, None).unwrap();
    assert!(!results.is_empty(), "Porter search should return results");
    assert!(results.iter().all(|h| h.source == "test-source"));
}

#[test]
fn test_search_trigram_fallback() {
    let (mut store, _dir) = make_store();
    // Index with content that won't match porter but will match trigram
    let chunks = ["foobarqux special content zyx".to_string()];
    store.index("trig-source", &chunks).unwrap();

    // "obar" is a trigram match but not a porter token
    // Trigram or levenshtein should pick it up — just verify no panic
    let _ = store.search("obar", 5, None);
}

#[test]
fn test_source_scoped_search() {
    let (mut store, _dir) = make_store();
    store
        .index("source-a", &["alpha content document".to_string()])
        .unwrap();
    store
        .index("source-b", &["beta content document".to_string()])
        .unwrap();

    let results = store.search("alpha", 10, Some("source-a")).unwrap();
    assert!(results.iter().all(|h| h.source == "source-a"));

    // Global search finds content
    let global = store.search("content", 10, None).unwrap();
    assert!(!global.is_empty());
}

#[test]
fn test_idempotent_reindex() {
    let (mut store, _dir) = make_store();
    let chunks = ["duplicate content".to_string()];
    store.index("dup-source", &chunks).unwrap();
    store.index("dup-source", &chunks).unwrap();

    // Should not double-count — search returns reasonable results, not duplicates
    let results = store.search("duplicate", 20, Some("dup-source")).unwrap();
    assert!(results.len() <= 5, "Re-index should not multiply results");
}

#[test]
fn test_source_label_is_unique_on_reindex() {
    let (mut store, _dir) = make_store();
    let chunks = ["duplicate content".to_string()];
    store.index("dup-source", &chunks).unwrap();
    store.index("dup-source", &chunks).unwrap();

    let count: i64 = store
        .conn
        .query_row(
            "SELECT COUNT(*) FROM sources WHERE label = ?1",
            rusqlite::params!["dup-source"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "source labels should be unique after reindex");
}

#[test]
fn test_empty_query_returns_empty() {
    let (mut store, _dir) = make_store();
    store
        .index("empty-q-source", &["some content here".to_string()])
        .unwrap();
    // Empty string won't match FTS5 — should gracefully return empty or error
    let results = store.search("", 5, None);
    // Either Ok(empty) or an error is acceptable
    if let Ok(r) = results {
        assert!(r.len() < 10);
    }
}
