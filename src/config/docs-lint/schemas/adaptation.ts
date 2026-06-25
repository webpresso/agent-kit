import { z } from "zod";

import { baseFrontmatter, dateString } from "./common.js";

/**
 * Frontmatter schema for adaptation documents.
 * Located in docs/adaptations/
 */
export const adaptationFrontmatter = baseFrontmatter.extend({
  type: z.literal("adaptation").optional(),

  /** Focus area (technology, competitor, trend) */
  focus: z.string().min(1),

  /** Status of the adaptation analysis */
  status: z.enum(["in-progress", "complete", "superseded"]),

  /** Date the analysis was created */
  created: dateString.optional(),

  /** Priority level for recommended actions */
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
});

export type AdaptationFrontmatter = z.infer<typeof adaptationFrontmatter>;
