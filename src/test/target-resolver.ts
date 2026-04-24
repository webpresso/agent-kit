export type TestTargetType = 'all' | 'file' | 'package'

export interface ResolvedTestTarget {
  type: TestTargetType
  values: string[]
}

export interface TestTargetInput {
  package?: readonly string[]
  file?: readonly string[]
  positional?: readonly string[]
}

const TEST_FILE_EXTENSIONS = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  '.test.js',
  '.test.jsx',
  '.spec.js',
  '.spec.jsx',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
] as const

export function looksLikeTestFilePath(target: string): boolean {
  const normalized = target.replace(/\\/gu, '/')
  return (
    normalized.includes('/') ||
    TEST_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
  )
}

export function resolveTestTarget(input: TestTargetInput): ResolvedTestTarget {
  const packageTargets = compact(input.package)
  const fileTargets = compact(input.file)
  const positionalTargets = compact(input.positional)

  if (packageTargets.length > 0 && fileTargets.length > 0) {
    throw new Error('Choose package targets or file targets, not both.')
  }

  if (packageTargets.length > 0) {
    return { type: 'package', values: packageTargets }
  }

  if (fileTargets.length > 0) {
    return { type: 'file', values: fileTargets }
  }

  if (positionalTargets.length === 0) {
    return { type: 'all', values: [] }
  }

  const hasFile = positionalTargets.some(looksLikeTestFilePath)
  const hasPackage = positionalTargets.some((target) => !looksLikeTestFilePath(target))

  if (hasFile && hasPackage) {
    throw new Error('Choose package targets or file targets, not both.')
  }

  return {
    type: hasFile ? 'file' : 'package',
    values: positionalTargets,
  }
}

function compact(values: readonly string[] | undefined): string[] {
  return values?.map((value) => value.trim()).filter((value) => value.length > 0) ?? []
}
