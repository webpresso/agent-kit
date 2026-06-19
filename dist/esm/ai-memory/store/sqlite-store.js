import { Database } from '#db/sqlite.js';
import { BaseCheckpointSaver } from '#ai-memory/checkpoint/saver.js';
import { CheckpointMetadataSchema, CheckpointStateSchema } from '#ai-memory/checkpoint/types.js';
import { z } from 'zod';
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_checkpoints (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  parent_id TEXT,
  state_json TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_checkpoints_thread_created
  ON ai_checkpoints(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_facts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence TEXT NOT NULL,
  source_id TEXT,
  embedding_json TEXT,
  access_count INTEGER NOT NULL,
  last_accessed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  invalidated INTEGER NOT NULL DEFAULT 0,
  invalidation_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_facts_thread_created
  ON ai_facts(thread_id, created_at DESC);
`;
const EmbeddingSchema = z.array(z.number());
export class SqliteAiMemoryStore extends BaseCheckpointSaver {
    db;
    constructor(dbPath) {
        super();
        this.db = new Database(dbPath);
        this.db.exec('PRAGMA busy_timeout = 5000');
        this.db.exec('PRAGMA journal_mode = WAL');
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec(SCHEMA_SQL);
    }
    close() {
        this.db.close();
    }
    async save(config, state, parentId) {
        const checkpointId = `ckpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO ai_checkpoints
          (id, thread_id, parent_id, state_json, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`)
            .run(checkpointId, config.threadId, parentId ?? null, JSON.stringify(state), null, now);
        return { success: true, checkpointId };
    }
    async loadLatest(threadId) {
        const row = this.db
            .prepare(`SELECT id, thread_id, parent_id, state_json, metadata_json, created_at
         FROM ai_checkpoints
         WHERE thread_id = ?
         ORDER BY created_at DESC
         LIMIT 1`)
            .get(threadId);
        return row ? this.mapCheckpoint(row) : null;
    }
    async load(checkpointId) {
        const row = this.db
            .prepare(`SELECT id, thread_id, parent_id, state_json, metadata_json, created_at
         FROM ai_checkpoints
         WHERE id = ?`)
            .get(checkpointId);
        return row ? this.mapCheckpoint(row) : null;
    }
    async list(options) {
        const limit = options?.limit ?? 100;
        const offset = options?.offset ?? 0;
        const orderField = options?.orderBy === 'step' ? 'created_at' : 'created_at';
        const orderDir = options?.order === 'asc' ? 'ASC' : 'DESC';
        if (options?.threadId) {
            const rows = this.db
                .prepare(`SELECT id, thread_id, parent_id, state_json, metadata_json, created_at
           FROM ai_checkpoints
           WHERE thread_id = ?
           ORDER BY ${orderField} ${orderDir}
           LIMIT ? OFFSET ?`)
                .all(options.threadId, limit, offset);
            return rows.map((row) => this.mapCheckpoint(row));
        }
        const rows = this.db
            .prepare(`SELECT id, thread_id, parent_id, state_json, metadata_json, created_at
         FROM ai_checkpoints
         ORDER BY ${orderField} ${orderDir}
         LIMIT ? OFFSET ?`)
            .all(limit, offset);
        return rows.map((row) => this.mapCheckpoint(row));
    }
    async delete(id) {
        const checkpointResult = this.db.prepare('DELETE FROM ai_checkpoints WHERE id = ?').run(id);
        if (checkpointResult.changes > 0) {
            return { success: true, checkpointId: id };
        }
        this.db.prepare('DELETE FROM ai_facts WHERE id = ?').run(id);
    }
    async clearThread(threadId) {
        this.db.prepare('DELETE FROM ai_checkpoints WHERE thread_id = ?').run(threadId);
        return { success: true };
    }
    async findByThread(threadId) {
        const rows = this.db
            .prepare(`SELECT id, thread_id, category, content, confidence, source_id, embedding_json,
                access_count, last_accessed_at, created_at, invalidated, invalidation_reason
         FROM ai_facts
         WHERE thread_id = ?
         ORDER BY created_at DESC`)
            .all(threadId);
        return rows.map((row) => this.mapFact(row));
    }
    async update(id, updates) {
        const current = await this.getFactById(id);
        if (!current)
            return;
        const next = { ...current, ...updates };
        this.db
            .prepare(`UPDATE ai_facts
         SET category = ?, content = ?, confidence = ?, source_id = ?, embedding_json = ?,
             access_count = ?, last_accessed_at = ?, created_at = ?, invalidated = ?, invalidation_reason = ?
         WHERE id = ?`)
            .run(next.category, next.content, next.confidence, next.sourceId ?? null, next.embedding ? JSON.stringify(next.embedding) : null, next.accessCount, next.lastAccessedAt.toISOString(), next.createdAt.toISOString(), next.invalidated ? 1 : 0, next.invalidationReason ?? null, id);
    }
    async insert(fact) {
        this.db
            .prepare(`INSERT INTO ai_facts
          (id, thread_id, category, content, confidence, source_id, embedding_json,
           access_count, last_accessed_at, created_at, invalidated, invalidation_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(fact.id, fact.threadId, fact.category, fact.content, fact.confidence, fact.sourceId ?? null, fact.embedding ? JSON.stringify(fact.embedding) : null, fact.accessCount, fact.lastAccessedAt.toISOString(), fact.createdAt.toISOString(), fact.invalidated ? 1 : 0, fact.invalidationReason ?? null);
    }
    async getLatestCheckpoint(threadId) {
        return await this.loadLatest(threadId);
    }
    async getFacts(options) {
        const rows = this.db
            .prepare(`SELECT id, thread_id, category, content, confidence, source_id, embedding_json,
                access_count, last_accessed_at, created_at, invalidated, invalidation_reason
         FROM ai_facts
         WHERE thread_id = ?
         ORDER BY created_at DESC`)
            .all(options.threadId);
        return rows
            .map((row) => this.mapFact(row))
            .filter((fact) => options.includeInvalidated || !fact.invalidated)
            .filter((fact) => !options.categories || options.categories.includes(fact.category))
            .map((fact) => ({
            ...fact,
            relevance: this.estimateRelevance(fact, options.query),
        }))
            .filter((fact) => fact.relevance >= (options.minRelevance ?? 0))
            .slice(0, options.limit ?? 50);
    }
    async touchFact(factId) {
        const current = await this.getFactById(factId);
        if (!current)
            return;
        this.db
            .prepare('UPDATE ai_facts SET access_count = ?, last_accessed_at = ? WHERE id = ?')
            .run(current.accessCount + 1, new Date().toISOString(), factId);
    }
    async getFactById(id) {
        const row = this.db
            .prepare(`SELECT id, thread_id, category, content, confidence, source_id, embedding_json,
                access_count, last_accessed_at, created_at, invalidated, invalidation_reason
         FROM ai_facts
         WHERE id = ?`)
            .get(id);
        return row ? this.mapFact(row) : null;
    }
    estimateRelevance(fact, query) {
        if (!query || query.trim() === '')
            return 1;
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const haystack = fact.content.toLowerCase();
        const matches = words.filter((word) => haystack.includes(word)).length;
        return words.length === 0 ? 1 : matches / words.length;
    }
    mapCheckpoint(row) {
        return {
            id: row.id,
            threadId: row.thread_id,
            parentId: row.parent_id ?? undefined,
            state: CheckpointStateSchema.parse(JSON.parse(row.state_json)),
            metadata: row.metadata_json
                ? CheckpointMetadataSchema.parse(JSON.parse(row.metadata_json, (_key, value) => value))
                : undefined,
            createdAt: new Date(row.created_at),
        };
    }
    mapFact(row) {
        return {
            id: row.id,
            threadId: row.thread_id,
            category: row.category,
            content: row.content,
            confidence: row.confidence,
            sourceId: row.source_id ?? undefined,
            embedding: row.embedding_json
                ? EmbeddingSchema.parse(JSON.parse(row.embedding_json))
                : undefined,
            accessCount: row.access_count,
            lastAccessedAt: new Date(row.last_accessed_at),
            createdAt: new Date(row.created_at),
            invalidated: row.invalidated === 1,
            invalidationReason: row.invalidation_reason ?? undefined,
        };
    }
}
//# sourceMappingURL=sqlite-store.js.map