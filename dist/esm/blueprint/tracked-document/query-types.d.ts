/**
 * Generic Query Types for Tracked Documents
 *
 * These types provide generic filter/sort base types that can be used
 * across different tracked document implementations (blueprints, etc).
 */
/**
 * Freshness score for a tracked document.
 * Indicates how recently the document has been updated relative to its status.
 */
export interface FreshnessScore {
    /** Numeric score from 0.0 (critical) to 1.0 (fresh) */
    score: number;
    /** Number of days since the last update */
    daysSinceUpdate: number;
    /** Categorical freshness status */
    status: 'fresh' | 'aging' | 'stale' | 'critical';
}
/**
 * Sort direction for query results.
 */
export type SortDirection = 'asc' | 'desc';
/**
 * Base sort options structure.
 * Specific implementations should extend this with their own sort fields.
 */
export interface BaseSortOptions<TField extends string> {
    /** Field to sort by */
    field: TField;
    /** Sort direction (ascending or descending) */
    direction: SortDirection;
}
/**
 * Base query filters structure.
 * Specific implementations should extend this with their own filter fields.
 */
export interface BaseQueryFilters {
    /** Filter for stale documents only */
    stale?: boolean;
    /** Custom staleness threshold in days (overrides default) */
    staleDays?: number;
}
//# sourceMappingURL=query-types.d.ts.map