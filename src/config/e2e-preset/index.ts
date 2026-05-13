export {
  createPlaywrightE2ePreset,
  type PlaywrightCompatibleConfig,
  type PlaywrightE2ePresetOptions,
} from './playwright.js'

export type E2ePresetRunnerKind = 'playwright' | 'vitest' | 'command'

export interface E2ePresetSuite {
  id: string
  runner: E2ePresetRunnerKind
  configPath: string
  fileMatchers: readonly string[]
}

export interface ResolveE2ePresetSuiteOptions<TSuite extends E2ePresetSuite = E2ePresetSuite> {
  suite?: string
  file?: string
  suites: readonly TSuite[]
}

const ROOT_PATTERNS: readonly RegExp[] = [
  /^(?:.*\/)?apps\/e2e\//u,
  /^(?:.*\/)?apps\/web\/[^/]+\/e2e\//u,
  /^(?:.*\/)?apps\/workers\/[^/]+\/e2e\//u,
]

export function defineE2ePresetSuite<TSuite extends E2ePresetSuite>(suite: TSuite): TSuite {
  return suite
}

export function normalizeE2ePresetPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/gu, '/').replace(/^\.\/+/u, '')

  for (const pattern of ROOT_PATTERNS) {
    const match = normalizedPath.match(pattern)
    if (match?.index !== undefined) {
      return normalizedPath.slice(match.index + match[0].length)
    }
  }

  return normalizedPath
}

export function resolveE2ePresetSuite<TSuite extends E2ePresetSuite>(
  options: ResolveE2ePresetSuiteOptions<TSuite>,
): TSuite | null {
  if (options.suite) {
    return options.suites.find((suite) => suite.id === options.suite) ?? null
  }

  if (!options.file) return null

  const normalizedPath = normalizeE2ePresetPath(options.file)
  return (
    options.suites.find((suite) =>
      suite.fileMatchers.some((matcher) => normalizedPath.startsWith(matcher)),
    ) ?? null
  )
}
