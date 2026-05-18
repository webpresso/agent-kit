import { z } from 'zod';
import { baseFrontmatter, dateString } from './common.js';
/**
 * Frontmatter schema for evaluations.
 * Located in docs/evaluations/
 */
export const evaluationFrontmatter = baseFrontmatter.extend({
    type: z.literal('evaluation').optional(),
    /** Date the evaluation was performed */
    evaluation_date: dateString,
    /** Model/tool being evaluated */
    model: z.string().min(1),
    /** Version of the evaluator (model version) */
    evaluator_version: z.string().optional(),
    /** Subject of the evaluation */
    subject: z.string().min(1),
    /** Scope of the evaluation (file, feature, etc.) */
    scope: z.string().min(1),
    /** Overall rating if applicable */
    rating: z.number().min(1).max(10).optional(),
});
//# sourceMappingURL=evaluation.js.map