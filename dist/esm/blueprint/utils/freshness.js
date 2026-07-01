/**
 * Freshness Calculator for Implementation Plans
 *
 * Calculates freshness scores using exponential decay.
 * Score = e^(-k * days), where k is calibrated so score = 0.5 at warning threshold.
 */
/**
 * Threshold configuration by plan status (in days).
 *
 * - in-progress: Actively worked on, needs frequent updates
 * - draft: Not yet started, more relaxed thresholds
 * - planned: Scheduled future work, relaxed thresholds
 * - parked: Intentionally paused work, same thresholds as planned/draft
 * - completed: Reference documentation, very relaxed thresholds
 * - archived: Historical record, most relaxed thresholds
 */
const THRESHOLDS = {
    "in-progress": { warning: 7, stale: 14, critical: 30 },
    draft: { warning: 14, stale: 30, critical: 60 },
    planned: { warning: 14, stale: 30, critical: 60 },
    parked: { warning: 14, stale: 30, critical: 60 },
    completed: { warning: 180, stale: 365, critical: 730 },
    archived: { warning: 365, stale: 730, critical: 1460 },
};
/**
 * Calculate the freshness score for a plan.
 *
 * Uses exponential decay: score = e^(-k * days)
 * The decay constant k is calibrated so score = 0.5 at the warning threshold.
 *
 * @param lastUpdated - The date the plan was last updated
 * @param planStatus - The status of the plan (affects thresholds)
 * @returns FreshnessScore with score, days since update, and status
 */
export function calculateFreshness(lastUpdated, planStatus) {
    const now = new Date();
    // Use UTC calendar components to avoid DST-induced off-by-one errors
    const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const lastUTC = Date.UTC(lastUpdated.getFullYear(), lastUpdated.getMonth(), lastUpdated.getDate());
    const daysSinceUpdate = Math.floor((nowUTC - lastUTC) / (1000 * 60 * 60 * 24));
    const thresholds = THRESHOLDS[planStatus];
    // Calibrate k so that score = 0.5 at warning threshold
    // e^(-k * warning) = 0.5
    // -k * warning = ln(0.5) = -ln(2)
    // k = ln(2) / warning
    const k = Math.LN2 / thresholds.warning;
    // Exponential decay: score = e^(-k * days)
    // Use Math.max(0, daysSinceUpdate) to handle future dates
    const score = Math.exp(-k * Math.max(0, daysSinceUpdate));
    // Determine status based on thresholds
    let status;
    if (daysSinceUpdate >= thresholds.critical) {
        status = "critical";
    }
    else if (daysSinceUpdate >= thresholds.stale) {
        status = "stale";
    }
    else if (daysSinceUpdate >= thresholds.warning) {
        status = "aging";
    }
    else {
        status = "fresh";
    }
    return { score, daysSinceUpdate, status };
}
//# sourceMappingURL=freshness.js.map