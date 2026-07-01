/**
 * TrackedDocumentService - Abstract base class for tracked document services
 *
 * This base class provides shared functionality for services that manage
 * tracked documents stored in git (e.g., blueprints, tech debt items).
 *
 * Uses the Template Method pattern:
 * - Base class provides skeleton operations (list, get, query, filter, sort)
 * - Subclasses implement document-specific logic (parseSummary, toRecord)
 *
 * @template TSummary - Lightweight summary type for list views
 * @template TRecord - Extended record type with query/filter fields
 * @template TFilters - Filter criteria specific to the document type
 * @template TSortOptions - Sorting options specific to the document type
 */
import matter from "gray-matter";
import * as fs from "node:fs/promises";
import { ZodError } from "zod";
/**
 * Abstract base class for services that manage tracked documents.
 *
 * Provides:
 * - Directory scanning and file discovery
 * - Filtering and sorting operations
 * - Summary computation helpers
 * - Template methods for subclass-specific logic
 */
export class TrackedDocumentService {
    /**
     * Base directory containing tracked documents (absolute or relative to repo root)
     */
    baseDir;
    /**
     * File pattern to match (e.g., '_overview.md', 'README.md')
     */
    filePattern;
    /**
     * Project root path for cross-service references (e.g., cross-linking).
     * When provided, used to construct sibling service instances.
     */
    projectPath;
    /**
     * @param baseDir - Directory containing tracked documents
     * @param filePattern - Filename pattern to scan for
     * @param projectPath - Optional project root path for cross-service references
     */
    constructor(baseDir, filePattern, projectPath) {
        this.baseDir = baseDir;
        this.filePattern = filePattern;
        this.projectPath = projectPath;
    }
    /**
     * Apply filters to a list of records.
     * Uses matchesAllFilters() which subclasses must implement.
     *
     * @param records - Records to filter
     * @param filters - Filter criteria
     * @returns Filtered records
     */
    applyFilters(records, filters) {
        return records.filter((record) => this.matchesAllFilters(record, filters));
    }
    /**
     * Helper: Count records by a field value.
     * Useful for computing summary statistics (e.g., byStatus, byGroup).
     *
     * @param records - Records to count
     * @param getField - Function to extract field value from record
     * @returns Map of field values to counts
     */
    countByField(records, getField) {
        const counts = {};
        for (const record of records) {
            const field = getField(record);
            counts[field] = (counts[field] ?? 0) + 1;
        }
        return counts;
    }
    /**
     * Helper: Check if a record is stale based on freshness score.
     * Common logic shared across all tracked document types.
     *
     * @param record - Record with freshness score
     * @returns True if record is stale or critical
     */
    isStale(record) {
        return record.freshness.status === "stale" || record.freshness.status === "critical";
    }
    /**
     * Helper: Check if a value matches a filter (single or array).
     * Handles both single values and arrays with OR logic.
     *
     * @param value - Value to check
     * @param filter - Filter value (single or array)
     * @returns True if value matches filter
     */
    matchesFilter(value, filter) {
        if (filter === undefined)
            return true;
        const filters = Array.isArray(filter) ? filter : [filter];
        return filters.includes(value);
    }
    /**
     * Check if a record's status matches the status filter.
     * Uses matchesFilter for single/array value handling.
     */
    matchesStatusFilter(status, filter) {
        return this.matchesFilter(status, filter);
    }
    /**
     * Handle parse errors when building summaries.
     * Provides graceful degradation for ZodError and generic Error types.
     * Returns a malformed summary with error indicator, or null for unknown errors.
     */
    async handleParseSummaryError(error, scanned) {
        if (error instanceof ZodError) {
            const content = await fs.readFile(scanned.path, "utf-8");
            const { data } = matter(content);
            const errorMessage = `Invalid frontmatter:\n${error.issues.map((e) => `  - ${e.path.join(".")}: ${e.message}`).join("\n")}`;
            return this.buildMalformedSummary(scanned, data, errorMessage);
        }
        if (error instanceof Error) {
            const content = await fs.readFile(scanned.path, "utf-8");
            const { data } = matter(content);
            return this.buildMalformedSummary(scanned, data, error.message);
        }
        return null;
    }
    /**
     * Build records from scanned documents by iterating and calling toRecord.
     * Extracts the common scan→iterate→toRecord pattern from query methods.
     */
    async buildRecords(scannedDocs) {
        const records = [];
        for (const scanned of scannedDocs) {
            const record = await this.toRecord(scanned.path, scanned.slug, scanned.group);
            if (record) {
                records.push(record);
            }
        }
        return records;
    }
    /**
     * Common query pipeline: filter, sort, and paginate records.
     * Subclasses scan and build records, then pass them to this method.
     */
    processQueryPipeline(allRecords, options) {
        let filtered = options?.filters ? this.applyFilters(allRecords, options.filters) : allRecords;
        if (options?.sort) {
            filtered = this.applySorting(filtered, options.sort);
        }
        const totalFiltered = filtered.length;
        if (options?.offset) {
            filtered = filtered.slice(options.offset);
        }
        if (options?.limit) {
            filtered = filtered.slice(0, options.limit);
        }
        return { records: filtered, totalFiltered };
    }
}
//# sourceMappingURL=TrackedDocumentService.js.map