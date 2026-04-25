import { z } from 'zod'

import { baseFrontmatter, complexity, dateString, implementationStatus } from './common'

/**
 * Frontmatter schema for implementation plans.
 * Located in webpresso/blueprints/.
 */
export const implementationPlanFrontmatter = baseFrontmatter.extend({
  type: z.enum(['blueprint']).optional(),

  /** Plan status: draft, in-progress, complete, archived */
  status: implementationStatus.optional(),

  /** Complexity estimate: XS, S, M, L, XL */
  complexity: complexity.optional(),

  /** Last update date (optional for incremental adoption) */
  last_updated: dateString.optional(),

  /** Dependencies on other plans */
  depends_on: z.array(z.string()).optional(),

  /** Epic this plan belongs to */
  epic: z.string().optional(),
})

export type ImplementationPlanFrontmatter = z.infer<typeof implementationPlanFrontmatter>

/**
 * Required sections for implementation plans
 * Note: Disabled - implementation plans have varied structures (phases, tasks, etc.)
 * that don't fit a strict Problem/Goal/Solution template
 */
export const implementationPlanSections = [] as const
