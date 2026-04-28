import { z } from 'zod';
import { baseFrontmatter, dateString } from './common';
/**
 * Schema for ongoing-initiative documents
 * Used for long-running quality/maintenance tasks in docs/ongoing-initiatives/
 */
export const ongoingInitiativeFrontmatter = baseFrontmatter.extend({
    type: z.literal('ongoing-initiative'),
    status: z.enum(['active', 'archived', 'superseded', 'draft', 'in-progress', 'current']),
    last_updated: dateString.optional(),
});
/**
 * Schema for plan-artifact documents
 * Used for supplementary files in implementation plans (INDEX.md, EXECUTIVE-SUMMARY.md, etc.)
 */
export const planArtifactFrontmatter = baseFrontmatter.extend({
    type: z.literal('plan-artifact'),
    artifact_type: z.enum(['reference', 'strategy', 'matrix', 'guide', 'spec']),
    last_updated: dateString.optional(),
});
/**
 * Schema for plan-report documents
 * Used for reports within implementation plans (violations-report.md, etc.)
 */
export const planReportFrontmatter = baseFrontmatter.extend({
    type: z.literal('plan-report'),
    report_type: z.string(),
    generated_date: dateString.optional(),
    last_updated: dateString.optional(),
});
