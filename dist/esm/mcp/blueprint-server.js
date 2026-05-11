/**
 * Blueprint structured-store MCP server — 8 tools for the blueprint DB.
 *
 * Call `registerBlueprintTools(registrar, cwd)` from server startup.
 * It calls `coldStartIfNeeded` once then registers all 8 tools.
 *
 * All outputs honour the summary-first envelope: { summary, failures, bytes, tokensSaved }
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { coldStartIfNeeded } from '#db/cold-start.js';
import { openDb } from '#db/connection.js';
import { ingestAll } from '#db/ingester.js';
import { findTemplate } from '#db/templates.js';
import { resolveBlueprintRoot } from '#utils/blueprint-root.js';
import { maybeHint } from './_tail-hints.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DB_FILENAME = '.blueprints.db';
const VALIDATE_TS_FILE = '.validate-timestamps.json';
const ROWS_CAP = 200;
const LIFECYCLE_ADVICE = 'After creating: /plan-refine to harden; /plan-eng-review to validate; ' +
    'ak_blueprint_promote draft→planned when ready; /pll for parallel execution; ' +
    '/verify before finalize';
const ALL_STATES = ['draft', 'planned', 'in-progress', 'parked', 'archived', 'completed'];
const NON_COMPLETED = ['draft', 'planned', 'in-progress', 'parked', 'archived'];
const BLUEPRINT_TEMPLATE = `---
type: blueprint
title: "{TITLE}"
status: draft
complexity: {COMPLEXITY}
owner: ""
created: {DATE}
last_updated: {DATE}
---

## Product wedge anchor

- **Stage outcome:** <cite roadmap section + specific outcome>
- **Consuming surface:** <route / component / verb + path>
- **New user-visible capability:** <one sentence>

## Summary

{GOAL}

## Tasks

#### Task 1.1: <task title>

**Status:** todo
**Wave:** 0
**Files:**
- (path)

**Acceptance:**
- [ ] <criterion>
`;
// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const dbPath = (cwd) => path.join(cwd, '.agent', DB_FILENAME);
const vtPath = (cwd) => path.join(cwd, '.agent', VALIDATE_TS_FILE);
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const toStr = (e) => (e instanceof Error ? e.message : String(e));
function jsonContent(payload, isError = false) {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError,
    };
}
function err(summary, error) {
    return jsonContent({ summary, failures: [error], bytes: 0, tokensSaved: 0 }, true);
}
function readVt(cwd) {
    try {
        return JSON.parse(readFileSync(vtPath(cwd), 'utf8'));
    }
    catch {
        return {};
    }
}
function writeVt(cwd, d) {
    mkdirSync(path.dirname(vtPath(cwd)), { recursive: true });
    writeFileSync(vtPath(cwd), JSON.stringify(d, null, 2), 'utf8');
}
function titleToSlug(t) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
function openDbRW(cwd) { return openDb(dbPath(cwd)); }
async function reIngest(cwd) {
    const target = dbPath(cwd);
    if (!existsSync(target))
        return;
    const conn = openDb(target);
    try {
        await ingestAll({ db: conn.db, cwd });
    }
    finally {
        conn.close();
    }
}
function findBlueprintDir(blueprintRoot, slug, states) {
    for (const state of states) {
        const d = path.join(blueprintRoot, state, slug);
        if (existsSync(d))
            return { dir: d, state };
    }
    return null;
}
function hasRecentAuditFinding(cwd) {
    const file = path.join(cwd, '.agent', '.tail-hint-history.jsonl');
    if (!existsSync(file))
        return false;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return readFileSync(file, 'utf8').split('\n').some((l) => {
        try {
            const r = JSON.parse(l);
            return r.hintId === 'AUDIT_FIX' && typeof r.ts === 'number' && r.ts >= cutoff;
        }
        catch {
            return false;
        }
    });
}
function appendHint(payload, cwd, hintId) {
    const h = maybeHint(cwd, hintId);
    if (h)
        payload['tail_hint'] = h;
}
function finishPayload(payload) {
    payload['bytes'] = bytes(JSON.stringify(payload));
    return jsonContent(payload);
}
// ---------------------------------------------------------------------------
// Validate logic (shared by handler + promote guard)
// ---------------------------------------------------------------------------
function runValidate(filePath) {
    if (!existsSync(filePath))
        return { valid: false, gaps: [`File not found: ${filePath}`] };
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    }
    catch (e) {
        return { valid: false, gaps: [`Cannot read: ${toStr(e)}`] };
    }
    const gaps = [];
    let fm;
    try {
        fm = matter(raw);
    }
    catch (e) {
        return { valid: false, gaps: [`Frontmatter parse error: ${toStr(e)}`] };
    }
    for (const f of ['type', 'title', 'status', 'complexity', 'owner']) {
        const v = fm.data[f];
        if (!v || String(v).trim() === '')
            gaps.push(`Missing or empty frontmatter field: ${f}`);
    }
    const body = fm.content;
    if (!/#### Task\s+\S/.test(body))
        gaps.push('No "#### Task" sections found');
    for (const block of body.split(/(?=#### Task\s)/).filter((b) => b.trim().startsWith('#### Task'))) {
        const label = (/#### Task\s+([\d.]+[:\s]+.+)/.exec(block)?.[1]?.trim()) ?? '(unknown)';
        if (!block.includes('**Acceptance:**') && !block.includes('**Acceptance criteria:**'))
            gaps.push(`Task "${label}" is missing **Acceptance:** subsection`);
    }
    if (!/##\s+Product wedge anchor/.test(body))
        gaps.push('Missing "## Product wedge anchor" section');
    return { valid: gaps.length === 0, gaps };
}
// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------
const querySchema = z.object({ template_id: z.string(), params: z.record(z.string(), z.unknown()).default({}) });
async function handleQuery(cwd, raw) {
    const p = querySchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_query validation error', p.error.message);
    const { template_id, params } = p.data;
    const tmpl = findTemplate(template_id);
    if (!tmpl)
        return err(`Unknown query template: ${template_id}`, `Template "${template_id}" not found.`);
    try {
        const conn = openDbRW(cwd);
        let rows;
        try {
            rows = conn.db.prepare(tmpl.sql).all(...Object.values(params));
        }
        finally {
            conn.close();
        }
        const capped = rows.slice(0, ROWS_CAP);
        const text = JSON.stringify(capped);
        const b = bytes(text);
        return jsonContent({ summary: `Query "${template_id}" returned ${rows.length} rows (cap ${ROWS_CAP})`, rows_capped: capped.length, rows: capped, failures: [], bytes: b, tokensSaved: Math.max(0, b - bytes(JSON.stringify(rows))) });
    }
    catch (e) {
        return err(`Query "${template_id}" failed`, toStr(e));
    }
}
const newSchema = z.object({ title: z.string(), complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']).default('M'), goal_prompt: z.string(), examples_count: z.number().int().min(0).max(5).default(3) });
async function handleNew(cwd, raw) {
    const p = newSchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_new validation error', p.error.message);
    const { title, complexity, goal_prompt, examples_count } = p.data;
    const today = new Date().toISOString().split('T')[0] ?? '';
    const template = BLUEPRINT_TEMPLATE.replace(/{TITLE}/g, title).replace(/{COMPLEXITY}/g, complexity).replace(/{DATE}/g, today).replace('{GOAL}', goal_prompt);
    const rulesFile = path.join(cwd, '.agent', 'rules', 'blueprint-scoping.md');
    const rulesContext = existsSync(rulesFile) ? readFileSync(rulesFile, 'utf8') : null;
    const examples = [];
    const target = dbPath(cwd);
    if (existsSync(target)) {
        try {
            const conn = openDb(target);
            try {
                examples.push(...conn.db.prepare(`SELECT slug, title, complexity FROM blueprints WHERE status = 'completed' AND complexity = ? ORDER BY ingested_at DESC LIMIT ?`).all(complexity, examples_count));
            }
            finally {
                conn.close();
            }
        }
        catch { /* non-fatal */ }
    }
    const b = bytes(template);
    const targetPath = path.join(resolveBlueprintRoot(cwd), 'draft', titleToSlug(title), '_overview.md');
    return jsonContent({ summary: `Blueprint bundle for "${title}" (complexity ${complexity})`, target_path: targetPath, template, rules_context: rulesContext, examples, lifecycle_advice: LIFECYCLE_ADVICE, validation_required: true, failures: [], bytes: b, tokensSaved: 0 });
}
const validateSchema = z.object({ path: z.string() });
async function handleValidate(cwd, raw) {
    const p = validateSchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_validate validation error', p.error.message);
    const { path: filePath } = p.data;
    const result = runValidate(filePath);
    if (result.valid) {
        const ts = readVt(cwd);
        ts[path.basename(path.dirname(filePath))] = Date.now();
        writeVt(cwd, ts);
    }
    const b = bytes(JSON.stringify(result));
    return jsonContent({ summary: result.valid ? `Blueprint at ${filePath} is valid` : `Blueprint at ${filePath} has ${result.gaps.length} gap(s)`, valid: result.valid, gaps: result.gaps, failures: result.gaps, bytes: b, tokensSaved: 0 });
}
const taskNextSchema = z.object({ blueprint: z.string().optional() });
async function handleTaskNext(cwd, raw) {
    const p = taskNextSchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_task_next validation error', p.error.message);
    const { blueprint } = p.data;
    const target = dbPath(cwd);
    if (!existsSync(target))
        return jsonContent({ summary: 'No blueprint DB found', task: null, failures: [], bytes: 0, tokensSaved: 0 });
    try {
        const conn = openDb(target);
        const sc = blueprint ? 'AND t.blueprint_slug = ?' : '';
        const readySql = `SELECT t.id, t.blueprint_slug, t.task_id, t.wave, t.lane, t.title, t.status FROM tasks t WHERE t.status = 'todo' ${sc} AND NOT EXISTS (SELECT 1 FROM task_dependencies td JOIN tasks dep ON dep.id = td.depends_on_task_id WHERE td.task_id = t.id AND dep.status != 'done') ORDER BY t.wave, t.id LIMIT 1`;
        const w0Sql = `SELECT COUNT(*) as cnt FROM tasks t WHERE t.status = 'todo' AND t.wave = '0' ${sc} AND NOT EXISTS (SELECT 1 FROM task_dependencies td JOIN tasks dep ON dep.id = td.depends_on_task_id WHERE td.task_id = t.id AND dep.status != 'done')`;
        let task;
        let w0cnt;
        let files;
        try {
            const args = blueprint ? [blueprint] : [];
            task = (blueprint ? conn.db.prepare(readySql).all(blueprint) : conn.db.prepare(readySql).all())[0] ?? null;
            w0cnt = (blueprint ? conn.db.prepare(w0Sql).all(blueprint) : conn.db.prepare(w0Sql).all())[0]?.cnt ?? 0;
            files = task ? conn.db.prepare('SELECT file_path, op FROM task_files WHERE task_id = ?').all(task.id) : [];
            void args;
        }
        finally {
            conn.close();
        }
        const payload = { summary: task ? `Next ready task: ${task.task_id} — ${task.title}` : 'No ready tasks found', task: task ? { id: task.id, lane: task.lane, title: task.title, files, deps_satisfied: true, blueprint_slug: task.blueprint_slug, task_id: task.task_id, wave: task.wave } : null, failures: [], bytes: 0, tokensSaved: 0 };
        if (w0cnt >= 3)
            appendHint(payload, cwd, 'PLL_PARALLEL');
        return finishPayload(payload);
    }
    catch (e) {
        return err('ak_blueprint_task_next failed', toStr(e));
    }
}
const advanceSchema = z.object({ task_id: z.string(), to: z.enum(['todo', 'in-progress', 'blocked', 'done', 'dropped']) });
async function handleTaskAdvance(cwd, raw) {
    const p = advanceSchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_task_advance validation error', p.error.message);
    const { task_id, to } = p.data;
    const target = dbPath(cwd);
    if (!existsSync(target))
        return err('ak_blueprint_task_advance failed', 'Blueprint DB not found');
    try {
        const conn = openDb(target);
        let oldStatus = null;
        let filePath = null;
        try {
            const row = conn.db.prepare('SELECT status, blueprint_slug FROM tasks WHERE task_id = ? LIMIT 1').get(task_id);
            if (!row)
                return err('ak_blueprint_task_advance failed', `Task "${task_id}" not found in DB`);
            oldStatus = row.status;
            const bp = conn.db.prepare('SELECT file_path FROM blueprints WHERE slug = ?').get(row.blueprint_slug);
            if (bp?.file_path)
                filePath = bp.file_path;
        }
        finally {
            conn.close();
        }
        if (filePath && existsSync(filePath)) {
            const lines = readFileSync(filePath, 'utf8').split('\n');
            let inBlock = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i] ?? '';
                if (line.match(new RegExp(`#### Task\\s+${task_id.replace(/\./g, '\\.')}`)))
                    inBlock = true;
                else if (inBlock && line.startsWith('#### '))
                    break;
                else if (inBlock && line.startsWith('**Status:**')) {
                    lines[i] = `**Status:** ${to}`;
                    break;
                }
            }
            writeFileSync(filePath, lines.join('\n'), 'utf8');
        }
        try {
            await reIngest(cwd);
        }
        catch { /* non-fatal */ }
        const payload = { summary: `Task "${task_id}" advanced from "${oldStatus}" to "${to}"`, task_id, old_status: oldStatus, new_status: to, failures: [], bytes: 0, tokensSaved: 0 };
        if (to === 'done')
            appendHint(payload, cwd, 'VERIFY_DONE');
        return finishPayload(payload);
    }
    catch (e) {
        return err('ak_blueprint_task_advance failed', toStr(e));
    }
}
const promoteSchema = z.object({ slug: z.string(), to_state: z.enum(['planned', 'in-progress', 'completed', 'parked', 'archived']) });
async function handlePromote(cwd, raw) {
    const p = promoteSchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_promote validation error', p.error.message);
    const { slug, to_state } = p.data;
    const root = resolveBlueprintRoot(cwd);
    const found = findBlueprintDir(root, slug, ALL_STATES);
    if (!found)
        return err('ak_blueprint_promote failed', `Blueprint "${slug}" not found in any state directory`);
    const { dir: currentDir, state: currentState } = found;
    const overviewPath = path.join(currentDir, '_overview.md');
    const ts = readVt(cwd);
    const mtime = existsSync(overviewPath) ? statSync(overviewPath).mtimeMs : 0;
    if ((ts[slug] ?? 0) < mtime)
        return err('ak_blueprint_promote refused', `Blueprint "${slug}" not validated since last write. Run ak_blueprint_validate first.`);
    const { renameSync } = await import('node:fs');
    const destDir = path.join(root, to_state, slug);
    mkdirSync(path.dirname(destDir), { recursive: true });
    try {
        renameSync(currentDir, destDir);
    }
    catch (e) {
        return err('ak_blueprint_promote failed', `Directory move error: ${toStr(e)}`);
    }
    const destOverview = path.join(destDir, '_overview.md');
    if (existsSync(destOverview)) {
        const fm = matter(readFileSync(destOverview, 'utf8'));
        fm.data['status'] = to_state;
        writeFileSync(destOverview, matter.stringify(fm.content, fm.data), 'utf8');
    }
    try {
        await reIngest(cwd);
    }
    catch { /* non-fatal */ }
    const payload = { summary: `Blueprint "${slug}" promoted from "${currentState}" to "${to_state}"`, slug, from_state: currentState, to_state, new_path: destOverview, failures: [], bytes: 0, tokensSaved: 0 };
    if (currentState === 'draft' && to_state === 'planned')
        appendHint(payload, cwd, 'PLAN_REFINE');
    return finishPayload(payload);
}
const finalizeSchema = z.object({ slug: z.string() });
async function handleFinalize(cwd, raw) {
    const p = finalizeSchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_finalize validation error', p.error.message);
    const { slug } = p.data;
    const target = dbPath(cwd);
    if (!existsSync(target))
        return err('ak_blueprint_finalize failed', 'Blueprint DB not found');
    const conn = openDb(target);
    let openTasks;
    try {
        openTasks = conn.db.prepare(`SELECT task_id, status FROM tasks WHERE blueprint_slug = ? AND status NOT IN ('done', 'dropped')`).all(slug);
    }
    finally {
        conn.close();
    }
    if (openTasks.length > 0)
        return err('ak_blueprint_finalize refused', `Blueprint "${slug}" has open tasks: ${openTasks.map((t) => `${t.task_id} (${t.status})`).join(', ')}`);
    const root = resolveBlueprintRoot(cwd);
    const found = findBlueprintDir(root, slug, NON_COMPLETED);
    if (!found) {
        const alreadyDone = path.join(root, 'completed', slug);
        if (existsSync(alreadyDone))
            return jsonContent({ summary: `Blueprint "${slug}" is already in completed`, slug, failures: [], bytes: 0, tokensSaved: 0 });
        return err('ak_blueprint_finalize failed', `Blueprint "${slug}" not found`);
    }
    const { renameSync } = await import('node:fs');
    const destDir = path.join(root, 'completed', slug);
    mkdirSync(path.dirname(destDir), { recursive: true });
    try {
        renameSync(found.dir, destDir);
    }
    catch (e) {
        return err('ak_blueprint_finalize failed', `Directory move error: ${toStr(e)}`);
    }
    const destOverview = path.join(destDir, '_overview.md');
    if (existsSync(destOverview)) {
        const fm = matter(readFileSync(destOverview, 'utf8'));
        fm.data['status'] = 'completed';
        fm.data['completed_at'] = new Date().toISOString().split('T')[0] ?? '';
        writeFileSync(destOverview, matter.stringify(fm.content, fm.data), 'utf8');
    }
    try {
        await reIngest(cwd);
    }
    catch { /* non-fatal */ }
    const payload = { summary: `Blueprint "${slug}" finalized and moved to completed`, slug, new_path: destOverview, failures: [], bytes: 0, tokensSaved: 0 };
    if (hasRecentAuditFinding(cwd))
        appendHint(payload, cwd, 'AUDIT_FIX');
    return finishPayload(payload);
}
const depgraphSchema = z.object({ from: z.string() });
async function handleDepgraph(cwd, raw) {
    const p = depgraphSchema.safeParse(raw);
    if (!p.success)
        return err('ak_blueprint_depgraph validation error', p.error.message);
    const { from } = p.data;
    const target = dbPath(cwd);
    if (!existsSync(target))
        return err('ak_blueprint_depgraph failed', 'Blueprint DB not found');
    try {
        const conn = openDb(target);
        const nodes = new Map();
        const edges = [];
        try {
            const queue = [from];
            const visited = new Set();
            while (queue.length > 0) {
                const slug = queue.shift();
                if (!slug || visited.has(slug))
                    continue;
                visited.add(slug);
                const bp = conn.db.prepare('SELECT slug, title, status FROM blueprints WHERE slug = ?').get(slug);
                if (bp)
                    nodes.set(slug, bp);
                for (const d of conn.db.prepare('SELECT depends_on_slug FROM blueprint_dependencies WHERE blueprint_slug = ?').all(slug)) {
                    edges.push({ from: slug, to: d.depends_on_slug, type: 'blueprint' });
                    if (!visited.has(d.depends_on_slug))
                        queue.push(d.depends_on_slug);
                }
                for (const cd of conn.db.prepare('SELECT target_repo, target_slug, target_slug_hash, is_redacted FROM cross_repo_dependencies WHERE blueprint_slug = ?').all(slug)) {
                    const to = cd.is_redacted === 1 && cd.target_slug_hash ? `private/${cd.target_slug_hash.slice(0, 12)}` : `${cd.target_repo}/${cd.target_slug ?? '?'}`;
                    edges.push({ from: slug, to, type: 'cross-repo', redacted: cd.is_redacted === 1 });
                }
            }
        }
        finally {
            conn.close();
        }
        const nodeList = [...nodes.values()];
        const b = bytes(JSON.stringify({ nodes: nodeList, edges }));
        return jsonContent({ summary: `Dependency graph from "${from}": ${nodeList.length} nodes, ${edges.length} edges`, nodes: nodeList, edges, failures: [], bytes: b, tokensSaved: 0 });
    }
    catch (e) {
        return err('ak_blueprint_depgraph failed', toStr(e));
    }
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export async function registerBlueprintTools(registrar, cwd) {
    await coldStartIfNeeded(cwd);
    registrar.registerTool('ak_blueprint_query', 'Run a pre-registered SQL template against the blueprint store. Returns { summary, rows_capped, rows, failures, bytes, tokensSaved }.', { type: 'object', properties: { template_id: { type: 'string' }, params: { type: 'object', default: {} } }, required: ['template_id'] }, undefined, (r) => handleQuery(cwd, r), { title: 'Blueprint Query', readOnlyHint: true, openWorldHint: false });
    registrar.registerTool('ak_blueprint_new', 'Return a drafting bundle for a new blueprint (no LLM call). Returns { target_path, template, rules_context, examples, lifecycle_advice, validation_required }.', { type: 'object', properties: { title: { type: 'string' }, complexity: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'], default: 'M' }, goal_prompt: { type: 'string' }, examples_count: { type: 'integer', minimum: 0, maximum: 5, default: 3 } }, required: ['title', 'goal_prompt'] }, undefined, (r) => handleNew(cwd, r), { title: 'Blueprint New', readOnlyHint: true, openWorldHint: false });
    registrar.registerTool('ak_blueprint_validate', 'Validate _overview.md structure. Returns { valid, gaps }. Must pass before ak_blueprint_promote.', { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, undefined, (r) => handleValidate(cwd, r), { title: 'Blueprint Validate', readOnlyHint: false, openWorldHint: false });
    registrar.registerTool('ak_blueprint_task_next', 'Return the next ready task (all deps done). Returns { summary, task }.', { type: 'object', properties: { blueprint: { type: 'string' } } }, undefined, (r) => handleTaskNext(cwd, r), { title: 'Blueprint Task Next', readOnlyHint: true, openWorldHint: false });
    registrar.registerTool('ak_blueprint_task_advance', 'Advance task status. Edits _overview.md and re-syncs DB. Returns { summary, old_status, new_status }.', { type: 'object', properties: { task_id: { type: 'string' }, to: { type: 'string', enum: ['todo', 'in-progress', 'blocked', 'done', 'dropped'] } }, required: ['task_id', 'to'] }, undefined, (r) => handleTaskAdvance(cwd, r), { title: 'Blueprint Task Advance', destructiveHint: false, openWorldHint: false });
    registrar.registerTool('ak_blueprint_promote', 'Promote a blueprint to a new lifecycle state. Refuses without prior validate. Returns { summary, new_path }.', { type: 'object', properties: { slug: { type: 'string' }, to_state: { type: 'string', enum: ['planned', 'in-progress', 'completed', 'parked', 'archived'] } }, required: ['slug', 'to_state'] }, undefined, (r) => handlePromote(cwd, r), { title: 'Blueprint Promote', destructiveHint: false, openWorldHint: false });
    registrar.registerTool('ak_blueprint_finalize', 'Finalize a blueprint (move to completed). Refuses if any tasks are not done/dropped. Returns { summary, new_path }.', { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] }, undefined, (r) => handleFinalize(cwd, r), { title: 'Blueprint Finalize', destructiveHint: false, openWorldHint: false });
    registrar.registerTool('ak_blueprint_depgraph', 'Build dependency graph from a blueprint slug. Private cross-org targets shown as private/<hash>. Returns { summary, nodes, edges }.', { type: 'object', properties: { from: { type: 'string' } }, required: ['from'] }, undefined, (r) => handleDepgraph(cwd, r), { title: 'Blueprint Dep Graph', readOnlyHint: true, openWorldHint: false });
}
//# sourceMappingURL=blueprint-server.js.map