import { z } from 'zod';
import { baseFrontmatter, dateString } from './common';
export const decisionFrontmatter = baseFrontmatter.extend({
    type: z.literal('decision').optional(),
    status: z.enum(['proposed', 'accepted', 'deprecated', 'superseded']),
    date: dateString,
    decision: z.string().min(1),
});
