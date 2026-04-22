/**
 * Error types for plan operations.
 */

/**
 * Error thrown when a plan is not found.
 * Includes structured data for fuzzy matching and helpful error messages.
 */
export class BlueprintNotFoundError extends Error {
  public readonly searchedPath: string
  public readonly availableSlugs: readonly string[]
  public readonly requestedSlug: string

  constructor(slug: string, searchedPath: string, availableSlugs: readonly string[]) {
    const message = buildPlanNotFoundMessage(slug, searchedPath, availableSlugs)
    super(message)
    this.name = 'BlueprintNotFoundError'
    this.requestedSlug = slug
    this.searchedPath = searchedPath
    this.availableSlugs = availableSlugs

    // Maintains proper stack trace for where our error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BlueprintNotFoundError)
    }
  }
}

/**
 * Build error message parts for plan not found errors.
 */
function buildErrorParts(
  slug: string,
  searchedPath: string,
  availableSlugs: readonly string[],
): string[] {
  const parts = [`Plan ${slug} not found.`, `Searched: ${searchedPath}`]

  if (!availableSlugs.length) {
    parts.push('No plans available.')
    return parts
  }

  parts.push(`Available plans: ${availableSlugs.join(', ')}`)

  return parts
}

/**
 * Build a helpful error message when a plan is not found.
 * Includes searched path and available slugs.
 */
function buildPlanNotFoundMessage(
  slug: string,
  searchedPath: string,
  availableSlugs: readonly string[],
): string {
  return buildErrorParts(slug, searchedPath, availableSlugs).join('\n')
}
