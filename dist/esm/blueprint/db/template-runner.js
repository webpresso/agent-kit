import { z } from 'zod';
import { QUERY_TEMPLATES, findTemplate } from './templates.js';
// ---------------------------------------------------------------------------
// Default param values applied before Zod validation
// ---------------------------------------------------------------------------
const PARAM_DEFAULTS = {
    'next-ready-task': { limit: 5 },
    'tech-debt-due-soon': { limit: 20, days: 14 },
    'completed-this-month': { limit: 20 },
    'overdue-tech-debt': { limit: 20 },
};
// ---------------------------------------------------------------------------
// runTemplate
// ---------------------------------------------------------------------------
export function runTemplate(db, templateId, params) {
    const template = findTemplate(templateId);
    if (template === undefined) {
        const available = QUERY_TEMPLATES.map((t) => `"${t.id}"`).join(', ');
        throw new Error(`Unknown template id: "${templateId}". Available: ${available}`);
    }
    // Merge caller params over defaults for this template
    const defaults = PARAM_DEFAULTS[templateId] ?? {};
    const merged = { ...defaults, ...params };
    // Validate params against the template's Zod schema
    const parsed = template.paramSchema.safeParse(merged);
    if (!parsed.success) {
        throw new z.ZodError(parsed.error.issues);
    }
    const validatedParams = parsed.data;
    // Enforce the template's row cap — use the lesser of caller's limit and maxRows
    const callerLimit = typeof validatedParams['limit'] === 'number'
        ? validatedParams['limit']
        : template.maxRows;
    const effectiveLimit = Math.min(callerLimit, template.maxRows);
    // Build the final param object with the effective limit substituted
    const runParams = { ...validatedParams, limit: effectiveLimit };
    let sql = template.sql;
    // Special: cross-repo-blocked-on supports an optional org_filter
    if (templateId === 'cross-repo-blocked-on' && typeof runParams['org_filter'] === 'string') {
        // Wrap in a SELECT that adds a LIKE filter on target_repo
        sql = `SELECT * FROM (${sql}) WHERE target_repo LIKE :org_filter || '%'`;
    }
    // For queries without a LIMIT placeholder, wrap with an outer LIMIT clause
    const sqlHasLimit = sql.includes(':limit');
    const finalSql = sqlHasLimit ? sql : `SELECT * FROM (${sql}) LIMIT ${effectiveLimit}`;
    const stmt = db.prepare(finalSql);
    // Only pass named params that are actually referenced in the SQL to avoid
    // better-sqlite3 "unknown binding" errors
    const stmtParams = _filterParams(runParams, finalSql);
    const rows = stmt.all(stmtParams);
    const capped = rows.length >= effectiveLimit;
    return { rows, capped, rowCount: rows.length };
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** Strip keys from params that are not referenced as :name in the SQL. */
function _filterParams(params, sql) {
    const result = {};
    for (const [key, value] of Object.entries(params)) {
        if (sql.includes(`:${key}`)) {
            result[key] = value;
        }
    }
    return result;
}
//# sourceMappingURL=template-runner.js.map