import { z } from 'zod';
// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const limitParamSchema = z.object({ limit: z.number().int().positive().max(1000).optional() });
const techDebtDueSoonParamSchema = z.object({
    limit: z.number().int().positive().max(1000).optional(),
    days: z.number().int().positive().max(365).optional(),
});
const crossRepoBlockedOnParamSchema = z.object({
    org_filter: z.string().min(1).optional(),
});
const noParamSchema = z.object({});
// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------
export const QUERY_TEMPLATES = [
    // -------------------------------------------------------------------------
    // next-ready-task
    // "What should an agent work on next?"
    // -------------------------------------------------------------------------
    {
        id: 'next-ready-task',
        description: 'Returns todo tasks in in-progress blueprints whose dependencies are all done, ordered by blueprint complexity then task_id.',
        sql: `
SELECT t.*, b.slug AS blueprint_slug, b.title AS blueprint_title
FROM tasks t
JOIN blueprints b ON b.slug = t.blueprint_slug
WHERE t.status IN ('todo')
  AND b.status = 'in-progress'
  AND NOT EXISTS (
    SELECT 1 FROM task_dependencies td
    JOIN tasks dep ON dep.id = td.depends_on_task_id
    WHERE td.task_id = t.id AND dep.status != 'done'
  )
ORDER BY CASE b.complexity
           WHEN 'XL' THEN 1
           WHEN 'L'  THEN 2
           WHEN 'M'  THEN 3
           WHEN 'S'  THEN 4
           WHEN 'XS' THEN 5
           ELSE 6
         END,
         t.task_id
LIMIT :limit
    `.trim(),
        paramSchema: limitParamSchema,
        maxRows: 50,
    },
    // -------------------------------------------------------------------------
    // blocked-blueprints
    // "Which in-progress blueprints have no ready tasks (all blocked)?"
    // -------------------------------------------------------------------------
    {
        id: 'blocked-blueprints',
        description: 'In-progress blueprints where every remaining task is blocked.',
        sql: `
SELECT b.slug, b.title, b.complexity, b.status,
  COUNT(t.id) AS total_tasks,
  SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_tasks,
  SUM(CASE WHEN t.status = 'blocked' THEN 1 ELSE 0 END) AS blocked_tasks
FROM blueprints b
LEFT JOIN tasks t ON t.blueprint_slug = b.slug
WHERE b.status = 'in-progress'
GROUP BY b.slug
HAVING done_tasks < total_tasks AND blocked_tasks = (total_tasks - done_tasks)
    `.trim(),
        paramSchema: noParamSchema,
        maxRows: 100,
    },
    // -------------------------------------------------------------------------
    // tech-debt-due-soon
    // "Tech-debt items with next_review within N days"
    // -------------------------------------------------------------------------
    {
        id: 'tech-debt-due-soon',
        description: 'Unresolved tech-debt items whose next_review falls within the given number of days (default 14).',
        sql: `
SELECT * FROM tech_debt_items
WHERE next_review IS NOT NULL
  AND next_review <= date('now', '+' || :days || ' days')
  AND status NOT IN ('resolved')
ORDER BY next_review, severity
LIMIT :limit
    `.trim(),
        paramSchema: techDebtDueSoonParamSchema,
        maxRows: 200,
    },
    // -------------------------------------------------------------------------
    // blueprint-risk-profile
    // "HIGH/CRITICAL risks in active blueprints"
    // -------------------------------------------------------------------------
    {
        id: 'blueprint-risk-profile',
        description: 'HIGH and CRITICAL risks attached to planned or in-progress blueprints.',
        sql: `
SELECT r.*, b.slug AS blueprint_slug, b.title, b.status
FROM risks r
JOIN blueprints b ON b.slug = r.blueprint_slug
WHERE b.status IN ('planned', 'in-progress')
  AND r.severity IN ('HIGH', 'CRITICAL')
ORDER BY CASE r.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 END, b.slug
    `.trim(),
        paramSchema: noParamSchema,
        maxRows: 500,
    },
    // -------------------------------------------------------------------------
    // cross-repo-blocked-on
    // "What cross-repo deps are unresolved?"
    // -------------------------------------------------------------------------
    {
        id: 'cross-repo-blocked-on',
        description: 'Cross-repo dependencies that are not yet completed, optionally filtered by target-repo prefix.',
        sql: `
SELECT crd.*, b.slug AS local_blueprint, b.title, b.status
FROM cross_repo_dependencies crd
JOIN blueprints b ON b.slug = crd.blueprint_slug
WHERE (crd.is_redacted = 0 AND crd.resolved_status NOT IN ('completed'))
   OR crd.resolved_status IS NULL
ORDER BY b.slug
    `.trim(),
        paramSchema: crossRepoBlockedOnParamSchema,
        maxRows: 200,
    },
    // -------------------------------------------------------------------------
    // cross-org-correlations
    // "What correlations cross org boundaries?"
    // -------------------------------------------------------------------------
    {
        id: 'cross-org-correlations',
        description: 'Cross-repo dependencies where is_cross_org = 1.',
        sql: `
SELECT crd.*, b.slug, b.organization
FROM cross_repo_dependencies crd
JOIN blueprints b ON b.slug = crd.blueprint_slug
WHERE crd.is_cross_org = 1
    `.trim(),
        paramSchema: noParamSchema,
        maxRows: 200,
    },
    // -------------------------------------------------------------------------
    // completed-this-month
    // "Which blueprints were completed in the current calendar month?"
    // -------------------------------------------------------------------------
    {
        id: 'completed-this-month',
        description: 'Blueprints completed in the current calendar month, most recent first.',
        sql: `
SELECT slug, title, complexity, owner, completed_at, organization
FROM blueprints
WHERE status = 'completed'
  AND completed_at IS NOT NULL
  AND completed_at >= strftime('%Y-%m-01', 'now')
ORDER BY completed_at DESC
LIMIT :limit
    `.trim(),
        paramSchema: limitParamSchema,
        maxRows: 100,
    },
    // -------------------------------------------------------------------------
    // overdue-tech-debt
    // "Tech-debt items whose next_review is in the past and not resolved"
    // -------------------------------------------------------------------------
    {
        id: 'overdue-tech-debt',
        description: 'Unresolved tech-debt items that are past their next_review date, highest severity first.',
        sql: `
SELECT *,
  CAST((julianday('now') - julianday(next_review)) AS INTEGER) AS days_overdue
FROM tech_debt_items
WHERE next_review IS NOT NULL
  AND next_review < date('now')
  AND status NOT IN ('resolved')
ORDER BY CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high'     THEN 2
           WHEN 'medium'   THEN 3
           WHEN 'low'      THEN 4
           ELSE 5
         END,
         next_review
LIMIT :limit
    `.trim(),
        paramSchema: limitParamSchema,
        maxRows: 200,
    },
    // -------------------------------------------------------------------------
    // in-progress-blueprints
    // "Summary of all currently in-progress blueprints with progress"
    // -------------------------------------------------------------------------
    {
        id: 'in-progress-blueprints',
        description: 'All in-progress blueprints with task counts and percent complete.',
        sql: `
SELECT
  b.slug, b.title, b.complexity, b.owner, b.last_updated,
  COUNT(t.id) AS total_tasks,
  SUM(CASE WHEN t.status = 'done'        THEN 1 ELSE 0 END) AS done_tasks,
  SUM(CASE WHEN t.status = 'in-progress' THEN 1 ELSE 0 END) AS active_tasks,
  SUM(CASE WHEN t.status = 'blocked'     THEN 1 ELSE 0 END) AS blocked_tasks,
  SUM(CASE WHEN t.status = 'todo'        THEN 1 ELSE 0 END) AS todo_tasks,
  CASE
    WHEN COUNT(t.id) = 0 THEN 0
    ELSE ROUND(100.0 * SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) / COUNT(t.id))
  END AS pct_done
FROM blueprints b
LEFT JOIN tasks t ON t.blueprint_slug = b.slug
WHERE b.status = 'in-progress'
GROUP BY b.slug
ORDER BY CASE b.complexity
           WHEN 'XL' THEN 1 WHEN 'L' THEN 2 WHEN 'M' THEN 3
           WHEN 'S'  THEN 4 WHEN 'XS' THEN 5 ELSE 6
         END,
         b.last_updated DESC
    `.trim(),
        paramSchema: noParamSchema,
        maxRows: 100,
    },
];
// ---------------------------------------------------------------------------
// Convenience: look up by id
// ---------------------------------------------------------------------------
export function findTemplate(id) {
    return QUERY_TEMPLATES.find((t) => t.id === id);
}
//# sourceMappingURL=templates.js.map