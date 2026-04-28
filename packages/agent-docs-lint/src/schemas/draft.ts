import { z } from 'zod'

import { dateString } from './common.js'

/**
 * Status values for draft documents
 */
export const draftStatus = z.enum(['wip', 'review', 'approved', 'rejected'])

/**
 * Schema for draft document frontmatter.
 * Drafts are work-in-progress documents that will be merged into target files.
 */
export const draftFrontmatter = z.object({
  /** Must be 'draft' */
  type: z.literal('draft'),

  /** Current status of the draft */
  status: draftStatus,

  /** Target file path where this draft will be merged */
  target: z.string().min(1, 'Target file path is required'),

  /** Brief description of what this draft adds/changes */
  purpose: z.string().min(1, 'Purpose description is required'),

  /** Creation date in YYYY-MM-DD format */
  created: dateString,

  /** Last update date in YYYY-MM-DD format */
  last_updated: dateString.optional(),

  /** Author (claude or human identifier) */
  author: z.string().optional(),

  /** Related documents or references */
  related: z.array(z.string()).optional(),

  /** Open questions that need resolution */
  open_questions: z.array(z.string()).optional(),
})

export type DraftFrontmatter = z.infer<typeof draftFrontmatter>

/**
 * Required sections for draft documents
 */
export const draftSections = ['Purpose', 'Content'] as const
