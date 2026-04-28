import { z } from 'zod';
import { baseFrontmatter } from './common';
/**
 * Frontmatter schema for cookbook patterns.
 * Located in docs/cookbook/
 */
export const cookbookFrontmatter = baseFrontmatter.extend({
    type: z.literal('cookbook').optional(),
    /** Category of the pattern (e.g., hono-routes, drizzle-orm) */
    category: z.string().min(1),
    /** Difficulty level */
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    /** Prerequisites for this pattern */
    prerequisites: z.array(z.string()).optional(),
});
/**
 * Required sections for cookbook patterns
 */
// Note: Disabled - cookbooks have varied structures
export const cookbookSections = [];
