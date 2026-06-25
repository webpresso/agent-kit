import { z } from "zod";

import { baseFrontmatter, dateString } from "./common.js";

/**
 * Frontmatter schema for research documents.
 * Located in docs/research/
 */
export const researchFrontmatter = baseFrontmatter.extend({
  type: z.literal("research").optional(),

  /** Research status */
  status: z
    .enum(["active", "archived", "superseded", "in-progress", "current", "draft"])
    .optional(),

  /** Date the research was conducted */
  date: dateString.optional(),

  /** Research methodology used */
  methodology: z.string().optional(),

  /** Key findings summary */
  findings: z.array(z.string()).optional(),
});

export type ResearchFrontmatter = z.infer<typeof researchFrontmatter>;
