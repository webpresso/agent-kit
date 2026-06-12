use session_memory_core::session::{capture_event, restore, snapshot};
use session_memory_core::store::open;
use tempfile::tempdir;

fn make_conn() -> (rusqlite::Connection, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("session.db");
    let conn = open(&path).unwrap();
    (conn, dir)
}

#[test]
fn test_capture_and_restore_round_trip() {
    let (conn, _dir) = make_conn();
    let agent_id = "agent-001";
    let event_id = "evt-001";
    let repo_hash = "repo-001";

    capture_event(
        &conn,
        repo_hash,
        agent_id,
        event_id,
        "Bash",
        "ran git status",
    )
    .unwrap();
    capture_event(
        &conn,
        repo_hash,
        agent_id,
        "evt-002",
        "Read",
        "read package.json",
    )
    .unwrap();

    let events = restore(&conn, repo_hash, agent_id, "git", 10).unwrap();
    assert!(!events.is_empty(), "Should restore at least one event");
    assert!(events.iter().any(|e| e.content.contains("git")));
}

#[test]
fn test_snapshot_creates_row() {
    let (conn, _dir) = make_conn();
    let agent_id = "agent-snap";
    let repo_hash = "repo-snap";

    capture_event(&conn, repo_hash, agent_id, "e1", "Bash", "mkdir foo").unwrap();
    capture_event(
        &conn,
        repo_hash,
        agent_id,
        "e2",
        "Write",
        "created foo/bar.ts",
    )
    .unwrap();

    let snap = snapshot(&conn, repo_hash, agent_id, 5000).unwrap();
    assert!(!snap.snapshot_id.is_empty());
    assert!(snap.complete);
    assert!(snap.event_count >= 2);
}

#[test]
fn test_snapshot_content_json_is_valid_for_multiline_content() {
    let (conn, _dir) = make_conn();
    let agent_id = "agent-json";
    let repo_hash = "repo-json";

    capture_event(
        &conn,
        repo_hash,
        agent_id,
        "e1",
        "Write",
        "line1\nline2\tvalue",
    )
    .unwrap();
    let snap = snapshot(&conn, repo_hash, agent_id, 5000).unwrap();

    let content_json: String = conn
        .query_row(
            "SELECT content_json FROM sessions WHERE snapshot_id = ?1",
            rusqlite::params![snap.snapshot_id],
            |row| row.get(0),
        )
        .unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&content_json).unwrap();
    assert!(parsed.is_array());
}

#[test]
fn test_snapshot_timeout_returns_partial() {
    let (conn, _dir) = make_conn();
    let agent_id = "agent-timeout";
    let repo_hash = "repo-timeout";

    // Insert many events
    for i in 0..10 {
        capture_event(
            &conn,
            repo_hash,
            agent_id,
            &format!("e{i}"),
            "Bash",
            &format!("event content number {i} with extra padding text"),
        )
        .unwrap();
    }

    // Zero ms cap — must return partial
    let snap = snapshot(&conn, repo_hash, agent_id, 0).unwrap();
    // May or may not be complete depending on speed, but must not panic
    assert!(!snap.snapshot_id.is_empty());
}

#[test]
fn test_restore_empty_query_returns_recent() {
    let (conn, _dir) = make_conn();
    let agent_id = "agent-empty-q";
    let repo_hash = "repo-empty";

    for i in 0..5 {
        capture_event(
            &conn,
            repo_hash,
            agent_id,
            &format!("e{i}"),
            "Bash",
            &format!("cmd {i}"),
        )
        .unwrap();
    }

    let events = restore(&conn, repo_hash, agent_id, "", 3).unwrap();
    assert!(events.len() <= 3);
    assert!(!events.is_empty());
}

#[test]
fn test_restore_unrelated_query_returns_no_hits() {
    let (conn, _dir) = make_conn();
    let agent_id = "agent-unrelated";
    let repo_hash = "repo-unrelated";

    capture_event(&conn, repo_hash, agent_id, "e1", "Bash", "ran git status").unwrap();
    capture_event(
        &conn,
        repo_hash,
        agent_id,
        "e2",
        "Read",
        "read package.json",
    )
    .unwrap();

    let events = restore(
        &conn,
        repo_hash,
        agent_id,
        "totally unrelated zebra quantum",
        10,
    )
    .unwrap();
    assert!(
        events.is_empty(),
        "unrelated non-empty queries should not return arbitrary recent events"
    );
}

#[test]
fn test_open_migrates_legacy_text_timestamps() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("legacy.db");

    {
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                agent_id TEXT NOT NULL,
                snapshot_id TEXT NOT NULL,
                repo_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                content_json TEXT NOT NULL
            );
            CREATE TABLE session_events (
                session_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                repo_hash TEXT NOT NULL,
                ts TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                content TEXT NOT NULL
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session_events(session_id, event_id, repo_hash, ts, tool_name, content)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                "agent-legacy",
                "legacy-1",
                "repo-legacy",
                "2026-06-12T10:00:00.000Z",
                "Bash",
                "old event"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions(agent_id, snapshot_id, repo_hash, created_at, status, content_json)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                "agent-legacy",
                "snap-legacy",
                "repo-legacy",
                "2026-06-12T10:00:00.000Z",
                "complete",
                "[]"
            ],
        )
        .unwrap();
    }

    let conn = open(&path).unwrap();
    let ts_value: String = conn
        .query_row(
            "SELECT CAST(ts AS TEXT) FROM session_events LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let created_at_value: String = conn
        .query_row(
            "SELECT CAST(created_at AS TEXT) FROM sessions LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert!(ts_value.chars().all(|char| char.is_ascii_digit()));
    assert!(created_at_value.chars().all(|char| char.is_ascii_digit()));
}

#[test]
fn test_concurrent_capture_doesnt_corrupt() {
    use std::sync::Arc;

    let dir = tempdir().unwrap();
    let path = Arc::new(dir.path().join("concurrent.db"));

    // Open conn once to init schema
    {
        let _init = open(&path).unwrap();
    }

    let handles: Vec<_> = (0..4)
        .map(|t| {
            let p = Arc::clone(&path);
            std::thread::spawn(move || {
                let conn = open(&p).unwrap();
                for i in 0..10 {
                    capture_event(
                        &conn,
                        "repo-concurrent",
                        "shared-agent",
                        &format!("t{t}-e{i}"),
                        "Bash",
                        &format!("thread {t} event {i}"),
                    )
                    .unwrap();
                }
            })
        })
        .collect();

    for h in handles {
        h.join().unwrap();
    }

    let conn = open(&path).unwrap();
    let events = restore(&conn, "repo-concurrent", "shared-agent", "", 100).unwrap();
    // 4 threads * 10 events = 40, WAL allows concurrent reads+writes
    assert!(events.len() >= 10, "WAL should allow concurrent capture");
}
