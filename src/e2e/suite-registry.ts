import type { E2eSuiteDefinition, ResolvedE2eFile } from './types.js'

export interface NormalizeE2ePathOptions {
  extraRootPatterns?: readonly RegExp[]
}

const BUILTIN_ROOT_PATTERNS: readonly RegExp[] = [
  /^(?:.*\/)?apps\/e2e\//u,
  /^(?:.*\/)?apps\/web\/[^/]+\/e2e\//u,
  /^(?:.*\/)?apps\/workers\/[^/]+\/e2e\//u,
]

export function defineE2eSuite<TSuite extends E2eSuiteDefinition>(suite: TSuite): TSuite {
  return suite
}

export function normalizeE2ePath(filePath: string, options: NormalizeE2ePathOptions = {}): string {
  const normalizedPath = filePath.replace(/\\/gu, '/').replace(/^\.\/+/u, '')
  const patterns = options.extraRootPatterns
    ? [...BUILTIN_ROOT_PATTERNS, ...options.extraRootPatterns]
    : BUILTIN_ROOT_PATTERNS

  for (const pattern of patterns) {
    const match = normalizedPath.match(pattern)
    if (match?.index !== undefined) {
      return normalizedPath.slice(match.index + match[0].length)
    }
  }

  return normalizedPath
}

export function resolveE2eSuiteId(
  name: string,
  suites: readonly E2eSuiteDefinition[],
): string | null {
  return suites.find((suite) => suite.id === name || suite.aliases?.includes(name))?.id ?? null
}

export function resolveE2eSuiteForPath(
  filePath: string,
  suites: readonly E2eSuiteDefinition[],
  normalizeOptions?: NormalizeE2ePathOptions,
): ResolvedE2eFile | null {
  const normalizedPath = normalizeE2ePath(filePath, normalizeOptions)
  const suite = suites.find((candidate) =>
    candidate.fileMatchers.some((matcher) => normalizedPath.startsWith(matcher)),
  )

  return suite ? { normalizedPath, suiteId: suite.id } : null
}
