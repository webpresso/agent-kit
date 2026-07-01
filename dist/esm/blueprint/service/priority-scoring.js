/**
 * Priority Scoring Algorithm for Technical Debt
 *
 * Calculates a 0-100 priority score based on multiple factors:
 * - Severity (10-40 points)
 * - Staleness (0-30 points)
 * - Overdue review (0-20 points)
 * - Active blueprint link (0-10 points)
 * - Category urgency (0-5 points)
 */
/**
 * Compute priority score for a tech debt item
 *
 * @param item - The tech debt record to score
 * @param linkedBlueprints - Blueprints that reference this tech debt item
 * @returns Priority score from 0-100 (higher = more urgent)
 */
export function computePriorityScore(item, linkedBlueprints) {
    let score = 0;
    // Severity (10-40 points)
    score += computeSeverityPoints(item.severity);
    // Staleness (0-30 points) - how long since last review
    if (item.lastReviewed) {
        score += computeStalenessPoints(item.lastReviewed);
    }
    // Overdue review (0-20 points)
    if (item.nextReview && isOverdue(item.nextReview)) {
        score += 20;
    }
    // Active blueprints (0-10 points)
    if (hasActiveBlueprintLink(linkedBlueprints)) {
        score += 10;
    }
    // Category urgency (0-5 points)
    if (item.category) {
        score += computeCategoryPoints(item.category);
    }
    // Cap at 100
    return Math.min(score, 100);
}
/**
 * Compute points based on severity level
 * Critical=40, High=30, Medium=20, Low=10
 */
function computeSeverityPoints(severity) {
    const severityPoints = {
        critical: 40,
        high: 30,
        medium: 20,
        low: 10,
    };
    return severityPoints[severity] ?? 10;
}
/**
 * Compute points based on days since last review
 * +1 point per day, capped at 30 points
 */
function computeStalenessPoints(lastReviewed) {
    const daysSince = Math.floor((Date.now() - lastReviewed.getTime()) / (1000 * 60 * 60 * 24));
    return Math.min(daysSince, 30);
}
/**
 * Check if an item is overdue for review
 */
function isOverdue(nextReview) {
    return new Date(nextReview) < new Date();
}
/**
 * Check if any linked blueprints are actively in progress
 */
function hasActiveBlueprintLink(linkedBlueprints) {
    return linkedBlueprints.some((bp) => bp.status === "in-progress");
}
/**
 * Compute points based on category urgency
 * Security=5, Testing=3, Others=0
 */
function computeCategoryPoints(category) {
    const categoryPoints = {
        security: 5,
        testing: 3,
    };
    return categoryPoints[category] ?? 0;
}
//# sourceMappingURL=priority-scoring.js.map