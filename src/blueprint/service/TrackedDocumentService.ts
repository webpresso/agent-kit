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

import type { FreshnessScore } from '#query/types'
import type { ScannedBlueprint } from './scanner.js'

import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import { ZodError } from 'zod'

/**
 * Base query options that all tracked document services support
 */
export interface BaseQueryOptions<TFilters, TSortOptions> {
  filters?: TFilters
  sort?: TSortOptions
  limit?: number
  offset?: number
}

/**
 * Base query result structure returned by all tracked document services.
 * Subclasses define their own result shape with domain-specific field names
 * (e.g., 'plans' for blueprints, 'items' for tech debt).
 */
export interface BaseQueryResult<TSummary> {
  /** Aggregate summary statistics */
  summary: TSummary
}

/**
 * Abstract base class for services that manage tracked documents.
 *
 * Provides:
 * - Directory scanning and file discovery
 * - Filtering and sorting operations
 * - Summary computation helpers
 * - Template methods for subclass-specific logic
 */
export abstract class TrackedDocumentService<
  TSummary,
  TRecord extends { freshness: FreshnessScore },
  TFilters,
  TSortOptions,
  TQueryResult extends BaseQueryResult<unknown> = BaseQueryResult<unknown>,
> {
  /**
   * Base directory containing tracked documents (absolute or relative to repo root)
   */
  protected readonly baseDir: string

  /**
   * File pattern to match (e.g., '_overview.md', 'README.md')
   */
  protected readonly filePattern: string

  /**
   * Project root path for cross-service references (e.g., cross-linking).
   * When provided, used to construct sibling service instances.
   */
  protected readonly projectPath: string | undefined

  /**
   * @param baseDir - Directory containing tracked documents
   * @param filePattern - Filename pattern to scan for
   * @param projectPath - Optional project root path for cross-service references
   */
  constructor(baseDir: string, filePattern: string, projectPath?: string) {
    this.baseDir = baseDir
    this.filePattern = filePattern
    this.projectPath = projectPath
  }

  /**
   * List all documents as lightweight summaries.
   * Subclasses must implement parseSummary() to extract summary data.
   *
   * @returns Array of document summaries
   */
  abstract list(): Promise<TSummary[]>

  /**
   * Get a single document by its unique identifier.
   * Subclasses must implement document-specific retrieval logic.
   *
   * @param id - Unique identifier (e.g., slug, path)
   * @returns Full document data
   */
  abstract get(id: string): Promise<unknown>

  /**
   * Query documents with filtering, sorting, and pagination.
   * Subclasses must implement toRecord() to convert documents to queryable records.
   *
   * @param options - Query options (filters, sort, pagination)
   * @returns Query result with records and summary
   */
  abstract query(options?: BaseQueryOptions<TFilters, TSortOptions>): Promise<TQueryResult>

  /**
   * Parse document content into a summary record.
   * Subclasses implement document-specific parsing logic.
   *
   * @param content - Raw file content
   * @param id - Document identifier
   * @returns Parsed summary or null if parsing fails
   */
  protected abstract parseSummary(content: string, id: string): TSummary | null

  /**
   * Convert document to a full record with query fields.
   * Subclasses implement document-specific transformation logic.
   *
   * @param filePath - Path to document file
   * @param id - Document identifier
   * @param group - Parent group/category (if applicable)
   * @returns Record with query fields or null if conversion fails
   */
  protected abstract toRecord(
    filePath: string,
    id: string,
    group: string | null,
  ): Promise<TRecord | null>

  /**
   * Apply filters to a list of records.
   * Uses matchesAllFilters() which subclasses must implement.
   *
   * @param records - Records to filter
   * @param filters - Filter criteria
   * @returns Filtered records
   */
  protected applyFilters(records: TRecord[], filters: TFilters): TRecord[] {
    return records.filter((record) => this.matchesAllFilters(record, filters))
  }

  /**
   * Check if a record matches all filter criteria.
   * Subclasses implement document-specific filter logic.
   *
   * @param record - Record to check
   * @param filters - Filter criteria
   * @returns True if record matches all filters
   */
  protected abstract matchesAllFilters(record: TRecord, filters: TFilters): boolean

  /**
   * Apply sorting to a list of records.
   * Subclasses implement document-specific sort logic.
   *
   * @param records - Records to sort
   * @param sort - Sort options
   * @returns Sorted records
   */
  protected abstract applySorting(records: TRecord[], sort: TSortOptions): TRecord[]

  /**
   * Helper: Count records by a field value.
   * Useful for computing summary statistics (e.g., byStatus, byGroup).
   *
   * @param records - Records to count
   * @param getField - Function to extract field value from record
   * @returns Map of field values to counts
   */
  protected countByField<T extends TRecord>(
    records: T[],
    getField: (record: T) => string,
  ): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const record of records) {
      const field = getField(record)
      counts[field] = (counts[field] ?? 0) + 1
    }
    return counts
  }

  /**
   * Helper: Check if a record is stale based on freshness score.
   * Common logic shared across all tracked document types.
   *
   * @param record - Record with freshness score
   * @returns True if record is stale or critical
   */
  protected isStale(record: TRecord): boolean {
    return record.freshness.status === 'stale' || record.freshness.status === 'critical'
  }

  /**
   * Helper: Check if a value matches a filter (single or array).
   * Handles both single values and arrays with OR logic.
   *
   * @param value - Value to check
   * @param filter - Filter value (single or array)
   * @returns True if value matches filter
   */
  protected matchesFilter<T>(value: T, filter: T | T[] | undefined): boolean {
    if (filter === undefined) return true
    const filters = Array.isArray(filter) ? filter : [filter]
    return filters.includes(value)
  }

  /**
   * Check if a record's status matches the status filter.
   * Uses matchesFilter for single/array value handling.
   */
  protected matchesStatusFilter(status: string, filter: string | string[] | undefined): boolean {
    return this.matchesFilter(status, filter)
  }

  /**
   * Build a malformed summary from frontmatter data and error message.
   * Subclasses implement document-specific summary construction.
   */
  protected abstract buildMalformedSummary(
    scanned: { path: string; slug: string },
    data: Record<string, unknown>,
    errorMessage: string,
  ): TSummary

  /**
   * Handle parse errors when building summaries.
   * Provides graceful degradation for ZodError and generic Error types.
   * Returns a malformed summary with error indicator, or null for unknown errors.
   */
  protected async handleParseSummaryError(
    error: unknown,
    scanned: { path: string; slug: string },
  ): Promise<TSummary | null> {
    if (error instanceof ZodError) {
      const content = await fs.readFile(scanned.path, 'utf-8')
      const { data } = matter(content)

      const errorMessage = `Invalid frontmatter:\n${error.issues.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n')}`
      return this.buildMalformedSummary(scanned, data, errorMessage)
    }

    if (error instanceof Error) {
      const content = await fs.readFile(scanned.path, 'utf-8')
      const { data } = matter(content)

      return this.buildMalformedSummary(scanned, data, error.message)
    }

    return null
  }

  /**
   * Build records from scanned documents by iterating and calling toRecord.
   * Extracts the common scan→iterate→toRecord pattern from query methods.
   */
  protected async buildRecords(scannedDocs: ScannedBlueprint[]): Promise<TRecord[]> {
    const records: TRecord[] = []
    for (const scanned of scannedDocs) {
      const record = await this.toRecord(scanned.path, scanned.slug, scanned.group)
      if (record) {
        records.push(record)
      }
    }
    return records
  }

  /**
   * Common query pipeline: filter, sort, and paginate records.
   * Subclasses scan and build records, then pass them to this method.
   */
  protected processQueryPipeline(
    allRecords: TRecord[],
    options?: BaseQueryOptions<TFilters, TSortOptions>,
  ): { records: TRecord[]; totalFiltered: number } {
    let filtered = options?.filters ? this.applyFilters(allRecords, options.filters) : allRecords

    if (options?.sort) {
      filtered = this.applySorting(filtered, options.sort)
    }

    const totalFiltered = filtered.length

    if (options?.offset) {
      filtered = filtered.slice(options.offset)
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit)
    }

    return { records: filtered, totalFiltered }
  }
}
