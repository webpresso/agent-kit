use criterion::{Criterion, criterion_group, criterion_main};
use session_memory_core::session::{capture_event, restore, snapshot};
use session_memory_core::store::{Store, open};
use tempfile::tempdir;

fn bench_index(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("bench_index.db");
    let mut store = Store::open(&path).unwrap();

    let chunks: Vec<String> = (0..100)
        .map(|i| {
            format!(
                "The quick brown fox jumps over the lazy dog. Chunk number {i}. \
                 Some additional context about the event to make it realistic in size."
            )
        })
        .collect();

    c.bench_function("index_100_chunks", |b| {
        b.iter(|| {
            store.index("bench-source", &chunks).unwrap();
        })
    });
}

fn bench_search(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("bench_search.db");
    let mut store = Store::open(&path).unwrap();

    // Pre-populate 1000 chunks
    let chunks: Vec<String> = (0..1000)
        .map(|i| {
            format!(
                "Document chunk {i}: agent-kit session memory engine performance benchmark \
                 with realistic content about TypeScript Rust FFI napi-rs SQLite FTS5."
            )
        })
        .collect();
    store.index("perf-source", &chunks).unwrap();

    c.bench_function("search_porter_1000_docs", |b| {
        b.iter(|| {
            store.search("TypeScript Rust FFI", 10, None).unwrap();
        })
    });

    c.bench_function("search_porter_scoped_1000_docs", |b| {
        b.iter(|| {
            store
                .search("napi-rs SQLite", 10, Some("perf-source"))
                .unwrap();
        })
    });
}

fn bench_session_capture(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("bench_capture.db");
    let conn = open(&path).unwrap();
    let agent_id = "bench-agent";
    let repo_hash = "bench-repo";
    let mut counter = 0u64;

    c.bench_function("capture_event", |b| {
        b.iter(|| {
            counter += 1;
            capture_event(
                &conn,
                repo_hash,
                agent_id,
                &format!("evt-{counter}"),
                "Bash",
                "git status --short --branch",
            )
            .unwrap();
        })
    });
}

fn bench_snapshot(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("bench_snapshot.db");
    let conn = open(&path).unwrap();
    let agent_id = "snap-agent";
    let repo_hash = "snap-repo";

    for i in 0..50 {
        capture_event(
            &conn,
            repo_hash,
            agent_id,
            &format!("e{i}"),
            "Bash",
            &format!("command output event {i}"),
        )
        .unwrap();
    }

    c.bench_function("snapshot_50_events", |b| {
        b.iter(|| {
            snapshot(&conn, repo_hash, agent_id, 5000).unwrap();
        })
    });
}

fn bench_restore(c: &mut Criterion) {
    let dir = tempdir().unwrap();
    let path = dir.path().join("bench_restore.db");
    let conn = open(&path).unwrap();
    let agent_id = "restore-agent";
    let repo_hash = "restore-repo";

    for i in 0..100 {
        capture_event(
            &conn,
            repo_hash,
            agent_id,
            &format!("e{i}"),
            "Bash",
            &format!("agent-kit session restore event {i} typescript rust napi"),
        )
        .unwrap();
    }

    c.bench_function("restore_100_events", |b| {
        b.iter(|| {
            restore(&conn, repo_hash, agent_id, "agent-kit session", 10).unwrap();
        })
    });
}

criterion_group!(
    benches,
    bench_index,
    bench_search,
    bench_session_capture,
    bench_snapshot,
    bench_restore
);
criterion_main!(benches);
