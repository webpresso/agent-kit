import { z } from 'zod'

import { baseFrontmatter, dateString, implementationStatus } from './common'

/**
 * Frontmatter schema for parent roadmaps (group-level planning documents).
 * Located in webpresso/blueprints/<group>/README.md.
 * Groups related initiatives under a common theme.
 */
export const parentRoadmapFrontmatter = baseFrontmatter.extend({
  type: z.literal('parent-roadmap'),

  /** Plan status: draft, in-progress, complete, archived */
  status: implementationStatus.optional(),

  /** Parent roadmap complexity (always L or XL for multi-initiative groups) */
  complexity: z.enum(['L', 'XL']).optional(),

  /** Creation date (optional for incremental adoption) */
  created: dateString.optional(),

  /** Last update date (optional for incremental adoption) */
  last_updated: dateString.optional(),
})

export type ParentRoadmapFrontmatter = z.infer<typeof parentRoadmapFrontmatter>

/**
 * Required sections for parent roadmaps
 * Note: Disabled - parent roadmaps have varied structures
 */
export const parentRoadmapSections = [] as const
