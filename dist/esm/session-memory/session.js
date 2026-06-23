import { Database } from '#db/sqlite.js';
import { shortId } from '#shared-utils/short-id.js';
export const SESSION_MEMORY_SCHEMA_VERSION = 2;
const DEFAULT_PRIORITY = 50;
const DEFAULT_MAX_EVENT_BYTES = 4096;
const DEFAULT_MAX_SNAPSHOT_BYTES = 64 * 1024;
const DEFAULT_MAX_CAPTURE_BYTES = 64 * 1024;
const REQUIRED_EVENT_COLUMNS = [
    'session_id',
    'event_id',
    'repo_hash',
    'ts',
    'event_type',
    'tool_name',
    'content',
    'summary',
    'priority',
    'metadata_json',
];
const REQUIRED_SESSION_COLUMNS = [
    'agent_id',
    'snapshot_id',
    'repo_hash',
    'created_at',
    'status',
    'content_json',
];
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  agent_id TEXT NOT NULL,
  snapshot_id TEXT PRIMARY KEY,
  repo_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  content_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_repo_created ON sessions(repo_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS session_events (
  session_id TEXT NOT NULL,
  event_id TEXT PRIMARY KEY,
  repo_hash TEXT NOT NULL,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_session_events_repo_ts ON session_events(repo_hash, ts DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_repo_session_ts ON session_events(repo_hash, session_id, ts DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS session_events_fts
  USING fts5(session_id UNINDEXED, event_id UNINDEXED, repo_hash UNINDEXED, tool_name UNINDEXED, content, tokenize='porter');
`;
function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${shortId(8)}`;
}
function byteLength(value) {
    return Buffer.byteLength(value, 'utf8');
}
function truncateUtf8(value, maxBytes) {
    if (maxBytes < 0 || byteLength(value) <= maxBytes)
        return { value, truncated: false };
    let bytes = 0;
    let output = '';
    for (const char of value) {
        const charBytes = byteLength(char);
        if (bytes + charBytes > maxBytes)
            break;
        output += char;
        bytes += charBytes;
    }
    return { value: output, truncated: true };
}
function unifiedPreview(value, maxBytes) {
    return truncateUtf8(value, maxBytes).value;
}
function normalizeLimit(value, fallback, max = 50) {
    if (value === undefined || !Number.isFinite(value) || value <= 0)
        return fallback;
    return Math.min(Math.trunc(value), max);
}
function dedupeUnifiedResults(results, limit) {
    const seen = new Set();
    return results
        .sort((a, b) => b.score - a.score ||
        b.timestamp.localeCompare(a.timestamp) ||
        a.provenance.id.localeCompare(b.provenance.id))
        .filter((result) => {
        if (seen.has(result.dedupeKey))
            return false;
        seen.add(result.dedupeKey);
        return true;
    })
        .slice(0, limit);
}
function normalizePriority(priority) {
    if (typeof priority !== 'number' || !Number.isFinite(priority))
        return DEFAULT_PRIORITY;
    return Math.trunc(priority);
}
function normalizePlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function safeJsonStringify(value) {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, nested) => {
        if (typeof nested === 'bigint')
            return nested.toString();
        if (typeof nested === 'object' && nested !== null) {
            if (seen.has(nested))
                return '[Circular]';
            seen.add(nested);
        }
        return nested;
    });
}
function normalizeMetadata(metadata) {
    return JSON.parse(safeJsonStringify(normalizePlainRecord(metadata)));
}
function parseMetadata(json) {
    try {
        const parsed = JSON.parse(json);
        return normalizePlainRecord(parsed);
    }
    catch {
        // Corrupt metadata should not make restore or snapshot fail.
    }
    return {};
}
function ftsContent(row) {
    return [row.event_type, row.summary, row.content].filter(Boolean).join('\n');
}
function rowToEnvelope(row, maxEventBytes) {
    const metadata = parseMetadata(String(row.metadata_json ?? '{}'));
    const content = String(row.content ?? '');
    const truncated = truncateUtf8(content, maxEventBytes);
    if (truncated.truncated)
        metadata.truncated = true;
    return {
        sessionId: row.session_id,
        eventId: row.event_id,
        ts: String(row.ts),
        eventType: row.event_type,
        toolName: String(row.tool_name),
        content: truncated.value,
        ...(row.summary ? { summary: row.summary } : {}),
        priority: normalizePriority(row.priority),
        metadata,
    };
}
export class SessionMemorySessionStore {
    db;
    constructor(dbPath) {
        this.db = new Database(dbPath);
        try {
            this.db.exec('PRAGMA journal_mode = WAL');
            this.db.exec('PRAGMA synchronous = NORMAL');
            this.db.exec('PRAGMA busy_timeout = 5000');
            const currentVersion = this.userVersion();
            const hadSessionsTable = this.tableExists('sessions');
            const hadSessionEventsTable = this.tableExists('session_events');
            if (currentVersion < SESSION_MEMORY_SCHEMA_VERSION) {
                this.migrateLegacySchema(hadSessionsTable, hadSessionEventsTable);
            }
            this.db.exec(SCHEMA_SQL);
            this.ensureCurrentSchema();
        }
        catch (error) {
            this.db.close();
            throw error;
        }
    }
    close() {
        this.db.close();
    }
    captureEvent(input) {
        const sessionId = input.sessionId ?? `${input.repoHash}:${input.agentId ?? 'default'}`;
        const eventId = input.event.eventId ?? newId('evt');
        const ts = input.event.ts ?? new Date().toISOString();
        const eventType = input.event.eventType;
        const priority = normalizePriority(input.event.priority);
        const metadata = normalizeMetadata(input.event.metadata);
        const content = truncateUtf8(input.event.content, DEFAULT_MAX_CAPTURE_BYTES);
        if (content.truncated)
            metadata.truncated = true;
        const metadataJson = safeJsonStringify(metadata);
        this.db
            .prepare(`INSERT OR REPLACE INTO session_events
           (session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(sessionId, eventId, input.repoHash, ts, eventType, input.event.toolName, content.value, input.event.summary ?? null, priority, metadataJson);
        this.db.prepare('DELETE FROM session_events_fts WHERE event_id = ?').run(eventId);
        this.db
            .prepare('INSERT INTO session_events_fts (session_id, event_id, repo_hash, tool_name, content) VALUES (?, ?, ?, ?, ?)')
            .run(sessionId, eventId, input.repoHash, input.event.toolName, ftsContent({
            content: content.value,
            summary: input.event.summary ?? null,
            event_type: eventType,
        }));
        return eventId;
    }
    snapshot(input) {
        const started = performance.now();
        const capMs = input.capMs ?? 5000;
        const sessionId = input.sessionId ?? `${input.repoHash}:${input.agentId ?? 'default'}`;
        const minPriority = input.minPriority ?? Number.MIN_SAFE_INTEGER;
        const maxEventBytes = input.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
        const maxSnapshotBytes = input.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
        const rows = this.db
            .prepare(`SELECT session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json
         FROM session_events
         WHERE repo_hash = ? AND session_id = ? AND priority >= ?
         ORDER BY priority DESC, ts DESC, event_id ASC`)
            .all(input.repoHash, sessionId, minPriority);
        const included = [];
        const lines = [];
        let usedBytes = 0;
        let exhausted = false;
        for (const row of rows) {
            if (performance.now() - started >= capMs) {
                exhausted = true;
                break;
            }
            const line = JSON.stringify(rowToEnvelope(row, maxEventBytes));
            const lineBytes = byteLength(line) + (lines.length > 0 ? 1 : 0);
            if (usedBytes + lineBytes > maxSnapshotBytes) {
                exhausted = true;
                break;
            }
            included.push(rowToEnvelope(row, maxEventBytes));
            lines.push(line);
            usedBytes += lineBytes;
        }
        const status = exhausted || included.length < rows.length ? 'partial' : 'complete';
        const content = lines.join('\n');
        const snapshotId = newId('snap');
        this.db
            .prepare(`INSERT INTO sessions (agent_id, snapshot_id, repo_hash, created_at, status, content_json)
         VALUES (?, ?, ?, ?, ?, ?)`)
            .run(input.agentId ?? 'default', snapshotId, input.repoHash, new Date().toISOString(), status, safeJsonStringify({ events: included, content }));
        return { snapshotId, sessionId, status, eventCount: included.length, content };
    }
    restore(input) {
        const query = input.query
            .trim()
            .split(/\s+/u)
            .filter(Boolean)
            .map((token) => `"${token.replaceAll('"', '""')}"`)
            .join(' ');
        if (!query)
            return [];
        const rows = this.db
            .prepare(`SELECT e.session_id, e.event_id, e.repo_hash, e.ts, e.event_type, e.tool_name, e.content, e.summary,
                e.priority, e.metadata_json, bm25(session_events_fts) * -1 AS score
         FROM session_events_fts f
         JOIN session_events e ON e.event_id = f.event_id
         WHERE session_events_fts MATCH ? AND e.repo_hash = ?
         ORDER BY score DESC, e.ts DESC
         LIMIT ?`)
            .all(query, input.repoHash, input.limit ?? 5);
        return rows.map((row) => {
            const envelope = rowToEnvelope(row, DEFAULT_MAX_EVENT_BYTES);
            return {
                ...envelope,
                score: row.score,
            };
        });
    }
    stats() {
        const eventCount = this.db.prepare('SELECT COUNT(*) AS count FROM session_events').get()
            ?.count ?? 0;
        const repoCount = this.db
            .prepare('SELECT COUNT(DISTINCT repo_hash) AS count FROM session_events')
            .get()?.count ?? 0;
        const sessionCount = this.db
            .prepare('SELECT COUNT(DISTINCT session_id) AS count FROM session_events')
            .get()?.count ?? 0;
        const snapshotCount = this.db.prepare('SELECT COUNT(*) AS count FROM sessions').get()
            ?.count ?? 0;
        return { eventCount, repoCount, sessionCount, snapshotCount };
    }
    purge(options = {}) {
        const where = [];
        const params = [];
        if (options.repoHash) {
            where.push('repo_hash = ?');
            params.push(options.repoHash);
        }
        if (options.sessionId) {
            where.push('session_id = ?');
            params.push(options.sessionId);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const eventIds = this.db
            .prepare(`SELECT event_id FROM session_events ${whereSql} ORDER BY event_id ASC`)
            .all(...params);
        const matchedEventCount = eventIds.length;
        const matchedSnapshotCount = options.sessionId
            ? 0
            : (this.db
                .prepare(`SELECT COUNT(*) AS count FROM sessions ${options.repoHash ? 'WHERE repo_hash = ?' : ''}`)
                .get(...(options.repoHash ? [options.repoHash] : []))?.count ?? 0);
        const dryRun = options.confirm !== true;
        const warnings = [];
        if (options.confirm === true && where.length === 0 && options.allowGlobal !== true) {
            warnings.push('global purge requires allowGlobal=true');
            return {
                dryRun: true,
                matchedEventCount,
                deletedEventCount: 0,
                matchedSnapshotCount,
                deletedSnapshotCount: 0,
                warnings,
            };
        }
        if (dryRun || (matchedEventCount === 0 && matchedSnapshotCount === 0)) {
            return {
                dryRun,
                matchedEventCount,
                deletedEventCount: 0,
                matchedSnapshotCount,
                deletedSnapshotCount: 0,
                warnings,
            };
        }
        const tx = this.db.transaction((rawEventIds) => {
            for (const row of rawEventIds) {
                this.db
                    .prepare('DELETE FROM session_events_fts WHERE event_id = ?')
                    .run(row.event_id);
                this.db.prepare('DELETE FROM session_events WHERE event_id = ?').run(row.event_id);
            }
            if (!options.sessionId) {
                if (options.repoHash) {
                    this.db
                        .prepare('DELETE FROM sessions WHERE repo_hash = ?')
                        .run(options.repoHash);
                }
                else {
                    this.db.prepare('DELETE FROM sessions').run();
                }
            }
        });
        tx(eventIds);
        return {
            dryRun: false,
            matchedEventCount,
            deletedEventCount: matchedEventCount,
            matchedSnapshotCount,
            deletedSnapshotCount: matchedSnapshotCount,
            warnings,
        };
    }
    doctor() {
        const warnings = [];
        const quickCheck = this.db.prepare('PRAGMA quick_check').get();
        if (quickCheck?.quick_check !== 'ok')
            warnings.push('session store quick_check failed');
        const stats = this.stats();
        return {
            ok: warnings.length === 0,
            eventCount: stats.eventCount,
            repoCount: stats.repoCount,
            sessionCount: stats.sessionCount,
            snapshotCount: stats.snapshotCount,
            warnings,
        };
    }
    restoreUnified(input) {
        if (input.sourceTypes && !input.sourceTypes.includes('continuity_event'))
            return [];
        const limit = normalizeLimit(input.limit, 5);
        const restored = this.restore({ ...input, limit: Math.max(limit * 2, limit) });
        return dedupeUnifiedResults(restored.map((event) => ({
            sourceType: 'continuity_event',
            provenance: {
                kind: 'continuity_event',
                id: event.eventId,
                repoHash: input.repoHash,
                sessionId: event.sessionId,
                eventId: event.eventId,
            },
            dedupeKey: `continuity_event:${input.repoHash}:${event.eventId}`,
            score: event.score,
            tier: 'event_fts',
            timestamp: event.ts,
            preview: unifiedPreview(event.content, normalizeLimit(input.maxPreviewBytes, 1024)),
            metadata: {
                ...event.metadata,
                eventType: event.eventType,
                toolName: event.toolName,
                priority: event.priority,
                ...(event.summary ? { summary: event.summary } : {}),
            },
        })), limit);
    }
    tableExists(tableName) {
        return Boolean(this.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(tableName));
    }
    tableColumns(tableName) {
        return new Set(this.db
            .prepare(`PRAGMA table_info(${tableName})`)
            .all()
            .map((column) => column.name));
    }
    userVersion() {
        return (this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    }
    migrateLegacySchema(hadSessionsTable, hadSessionEventsTable) {
        this.migrateLegacySessionsSchema(hadSessionsTable);
        this.migrateLegacySessionEventsSchema(hadSessionEventsTable);
    }
    migrateLegacySessionsSchema(hadSessionsTable) {
        if (!hadSessionsTable)
            return;
        const columns = this.tableColumns('sessions');
        if (REQUIRED_SESSION_COLUMNS.every((column) => columns.has(column)))
            return;
        for (const requiredIdentityColumn of ['agent_id', 'snapshot_id']) {
            if (!columns.has(requiredIdentityColumn)) {
                throw new Error(`cannot migrate legacy sessions table; missing required column: ${requiredIdentityColumn}`);
            }
        }
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.exec(`
        DROP INDEX IF EXISTS idx_sessions_repo_created;
        ALTER TABLE sessions RENAME TO sessions_legacy_migration;
        CREATE TABLE sessions (
          agent_id TEXT NOT NULL,
          snapshot_id TEXT PRIMARY KEY,
          repo_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          content_json TEXT NOT NULL DEFAULT '{}'
        );
      `);
            const repoHashExpr = columns.has('repo_hash')
                ? "COALESCE(NULLIF(repo_hash, ''), 'legacy')"
                : "'legacy'";
            const createdAtExpr = columns.has('created_at')
                ? "COALESCE(NULLIF(CAST(created_at AS TEXT), ''), '1970-01-01T00:00:00.000Z')"
                : "'1970-01-01T00:00:00.000Z'";
            const statusExpr = columns.has('status')
                ? "COALESCE(NULLIF(status, ''), 'active')"
                : "'active'";
            const contentJsonExpr = columns.has('content_json')
                ? "COALESCE(NULLIF(content_json, ''), '{}')"
                : "'{}'";
            this.db
                .prepare(`INSERT OR IGNORE INTO sessions(agent_id, snapshot_id, repo_hash, created_at, status, content_json)
           SELECT COALESCE(NULLIF(agent_id, ''), 'legacy-agent'),
                  COALESCE(NULLIF(snapshot_id, ''), 'legacy-snapshot-' || rowid),
                  ${repoHashExpr},
                  ${createdAtExpr},
                  ${statusExpr},
                  ${contentJsonExpr}
             FROM sessions_legacy_migration`)
                .run();
            this.db.exec('DROP TABLE sessions_legacy_migration');
            this.db.exec('COMMIT');
        }
        catch (error) {
            if (this.db.inTransaction)
                this.db.exec('ROLLBACK');
            throw error;
        }
    }
    migrateLegacySessionEventsSchema(hadSessionEventsTable) {
        if (!hadSessionEventsTable)
            return;
        const columns = this.tableColumns('session_events');
        if (REQUIRED_EVENT_COLUMNS.every((column) => columns.has(column)))
            return;
        for (const requiredIdentityColumn of ['session_id', 'event_id', 'ts', 'tool_name', 'content']) {
            if (!columns.has(requiredIdentityColumn)) {
                throw new Error(`cannot migrate legacy session_events table; missing required column: ${requiredIdentityColumn}`);
            }
        }
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.db.exec(`
        DROP TABLE IF EXISTS session_events_fts;
        DROP INDEX IF EXISTS idx_session_events_repo_ts;
        DROP INDEX IF EXISTS idx_session_events_repo_session_ts;
        DROP INDEX IF EXISTS idx_session_events_repo_priority_ts;
        ALTER TABLE session_events RENAME TO session_events_legacy_migration;
        CREATE TABLE session_events (
          session_id TEXT NOT NULL,
          event_id TEXT PRIMARY KEY,
          repo_hash TEXT NOT NULL,
          ts TEXT NOT NULL,
          event_type TEXT NOT NULL DEFAULT 'tool_command',
          tool_name TEXT NOT NULL,
          content TEXT NOT NULL,
          summary TEXT,
          priority INTEGER NOT NULL DEFAULT 50,
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
      `);
            const repoHashExpr = columns.has('repo_hash')
                ? "COALESCE(NULLIF(e.repo_hash, ''), 'legacy')"
                : this.tableExists('sessions') && this.tableColumns('sessions').has('repo_hash')
                    ? "COALESCE((SELECT NULLIF(s.repo_hash, '') FROM sessions s WHERE s.agent_id = e.session_id ORDER BY s.created_at DESC LIMIT 1), 'legacy')"
                    : "'legacy'";
            const eventTypeExpr = columns.has('event_type')
                ? "COALESCE(NULLIF(e.event_type, ''), 'tool_command')"
                : "'tool_command'";
            const summaryExpr = columns.has('summary') ? 'e.summary' : 'NULL';
            const priorityExpr = columns.has('priority')
                ? 'COALESCE(CAST(e.priority AS INTEGER), 50)'
                : '50';
            const metadataExpr = columns.has('metadata_json')
                ? "COALESCE(NULLIF(e.metadata_json, ''), '{}')"
                : "'{}'";
            this.db
                .prepare(`INSERT OR IGNORE INTO session_events(
             session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json
           )
           SELECT COALESCE(NULLIF(e.session_id, ''), 'legacy-session'),
                  COALESCE(NULLIF(e.event_id, ''), 'legacy-event-' || e.rowid),
                  ${repoHashExpr},
                  COALESCE(NULLIF(CAST(e.ts AS TEXT), ''), '1970-01-01T00:00:00.000Z'),
                  ${eventTypeExpr},
                  COALESCE(NULLIF(e.tool_name, ''), 'Unknown'),
                  COALESCE(e.content, ''),
                  ${summaryExpr},
                  ${priorityExpr},
                  ${metadataExpr}
             FROM session_events_legacy_migration e`)
                .run();
            this.db.exec('DROP TABLE session_events_legacy_migration');
            this.db.exec('COMMIT');
        }
        catch (error) {
            if (this.db.inTransaction)
                this.db.exec('ROLLBACK');
            throw error;
        }
    }
    ensureCurrentSchema() {
        const currentVersion = this.userVersion();
        if (currentVersion >= SESSION_MEMORY_SCHEMA_VERSION)
            return;
        this.db.exec('BEGIN IMMEDIATE');
        try {
            this.assertCurrentSchemaInTransaction();
            this.rebuildFtsInTransaction();
            this.db.exec(`PRAGMA user_version = ${SESSION_MEMORY_SCHEMA_VERSION}`);
            this.db.exec('COMMIT');
        }
        catch (error) {
            if (this.db.inTransaction)
                this.db.exec('ROLLBACK');
            throw error;
        }
    }
    assertCurrentSchemaInTransaction() {
        const columns = this.tableColumns('session_events');
        const missingColumns = REQUIRED_EVENT_COLUMNS.filter((column) => !columns.has(column));
        if (missingColumns.length > 0) {
            throw new Error(`session-memory schema migration failed; missing columns: ${missingColumns.join(', ')}`);
        }
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_session_events_repo_priority_ts ON session_events(repo_hash, priority DESC, ts DESC)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_session_events_repo_session_ts ON session_events(repo_hash, session_id, ts DESC)');
    }
    rebuildFtsInTransaction() {
        this.db.exec('DELETE FROM session_events_fts');
        const rows = this.db
            .prepare(`SELECT session_id, event_id, repo_hash, ts, event_type, tool_name, content, summary, priority, metadata_json
         FROM session_events`)
            .all();
        const insert = this.db.prepare('INSERT INTO session_events_fts (session_id, event_id, repo_hash, tool_name, content) VALUES (?, ?, ?, ?, ?)');
        for (const row of rows) {
            insert.run(row.session_id, row.event_id, row.repo_hash, row.tool_name, ftsContent(row));
        }
    }
}
//# sourceMappingURL=session.js.map