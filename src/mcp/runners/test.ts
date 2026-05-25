import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  isRunFailure,
  runCommand as runSharedCommand,
} from '#mcp/tools/_shared/run-command'

// Keep the runner's own deadline below common MCP client call ceilings so a
// slow workspace suite returns a structured `timedOut` payload and the spawned
// Vitest process group is cleaned up before the client drops the request.
const DEFAULT_TEST_TIMEOUT_MS = 105_000

export interface TestRunInput {
  /** Working tree to run from. Defaults to `CLAUDE_PROJECT_DIR` or `process.cwd()`. */
  readonly cwd?: string
  readonly packages?: readonly string[]
  readonly files?: readonly string[]
  readonly extraArgs?: readonly string[]
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface TestResult {
  readonly passed: boolean
  readonly output: string
  readonly exitCode: number
  readonly timedOut?: boolean
  readonly aborted?: boolean
}

/**
 * Run tests via the `vp` facade over the repo-declared package-manager substrate.
 *
 * Argv shape:
 *   - `vp run --filter <p> test` once per package when packages are given (results
 *     aggregated; first non-zero exit wins).
 *   - `vp run test -- <file1> <file2>` when files are given (no packages).
 *   - `vp run test` otherwise.
 */
export async function runTests(input: TestRunInput): Promise<TestResult> {
  const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  if (input.packages && input.packages.length > 0) {
    let combinedOutput = ''
    let firstFailure = 0
    let timedOut = false
    let aborted = false
    for (const pkg of input.packages) {
      const result = await runPackageScopedTests(cwd, pkg, input)
      combinedOutput += result.output
      if (!result.passed && firstFailure === 0) firstFailure = result.exitCode
      if (result.timedOut) timedOut = true
      if (result.aborted) aborted = true
    }
    return {
      passed: firstFailure === 0,
      output: combinedOutput,
      exitCode: firstFailure,
      timedOut,
      aborted,
    }
  }

  if (input.files && input.files.length > 0) {
    if (usesVitest(cwd)) {
      return runCommand(
        'vp',
        ['exec', '--', 'vitest', 'run', '--reporter=json', '--no-color', ...input.files],
        { ...input, cwd },
      )
    }
    return runCommand('vp', ['run', 'test', '--', ...input.files], { ...input, cwd })
  }

  return runCommand('vp', ['run', 'test'], { ...input, cwd })
}

function runPackageScopedTests(
  cwd: string,
  packageName: string,
  input: TestRunInput,
): Promise<TestResult> {
  const files = input.files
  const options = { cwd, signal: input.signal, timeoutMs: input.timeoutMs }
  if (usesVitest(cwd, packageName)) {
    return runCommand(
      'vp',
      [
        'exec',
        '--filter',
        packageName,
        '--',
        'vitest',
        'run',
        '--reporter=json',
        '--no-color',
        ...(files ?? []),
      ],
      options,
    )
  }

  if (files && files.length > 0) {
    return runCommand('vp', ['run', '--filter', packageName, 'test', '--', ...files], options)
  }

  return runCommand('vp', ['run', '--filter', packageName, 'test'], options)
}

function usesVitest(cwd: string, packageName?: string): boolean {
  const packageJson = findPackageJson(cwd, packageName)
  if (!packageJson) return false
  const pkg = readPackage(packageJson)
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
  return sections.some((section) => {
    const deps = pkg[section]
    return Boolean(deps && typeof deps === 'object' && !Array.isArray(deps) && 'vitest' in deps)
  })
}

function findPackageJson(cwd: string, packageName?: string): string | undefined {
  const candidates = packageName
    ? [
        join(cwd, 'packages', packageName, 'package.json'),
        join(cwd, 'apps', packageName, 'package.json'),
        join(cwd, packageName, 'package.json'),
        join(cwd, 'package.json'),
      ]
    : [join(cwd, 'package.json')]

  return candidates.find((candidate) => existsSync(candidate))
}

function readPackage(file: string): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
  } catch {
    return {}
  }
}

async function runCommand(
  cmd: string,
  args: readonly string[],
  options: Pick<TestRunInput, 'cwd' | 'signal' | 'timeoutMs'>,
): Promise<TestResult> {
  const outcome = await runSharedCommand(cmd, args, {
    cwd: options.cwd,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
  })
  if (isRunFailure(outcome)) throw outcome.error
  const output = [outcome.stdout, outcome.stderr].filter(Boolean).join('')
  return {
    passed: outcome.exitCode === 0,
    output,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    aborted: outcome.aborted,
  }
}
