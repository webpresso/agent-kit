import { z } from 'zod'

import { baseFrontmatter } from './common.js'

/**
 * Schema for Rule documents in docs/rules/
 */
export const ruleFrontmatter = baseFrontmatter.extend({
  type: z.literal('rule'),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  enforcement: z.enum(['automated', 'manual', 'hybrid']),
})

export type RuleFrontmatter = z.infer<typeof ruleFrontmatter>

export const ruleSections = ['# ', '> **Policy**:']
