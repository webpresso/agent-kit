import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface TestRunInput {
  readonly packages?: readonly string[]
  readonly files?: readonly string[]
  readonly extraArgs?: readonly string[]
}

export interface TestResult {
  readonly passed: boolean
  readonly output: string
  readonly exitCode: number
}

/**
 * Run tests via `just test`.
 *
 * Argv shape:
 *   - `just test --package <p1> <p2> ...` when packages are given.
 *   - `just test --file <f1> <f2> ...` when files are given (and no packages).
 *   - `just test` otherwise.
 *
 * Captures stdout + stderr; resolves with the structured result and the
 * spawned process's exit code.
 */
export async function runTests(input: TestRunInput): Promise<TestResult> {
  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const args: string[] = ['test']
  if (input.packages && input.packages.length > 0) {
    args.push('--package', ...input.packages)
  } else if (input.files && input.files.length > 0) {
    args.push('--file', ...input.files)
  }
  const extraArgs = input.extraArgs ?? inferExtraArgs(cwd, input)
  if (extraArgs.length > 0) {
    args.push('--', ...extraArgs)
  }

  return runCommand('just', args)
}

function inferExtraArgs(cwd: string, input: TestRunInput): readonly string[] {
  if (input.packages?.some((pkg) => usesVitest(cwd, pkg)) || (!input.packages?.length && usesVitest(cwd))) {
    return ['--reporter=json', '--no-color']
  }
  return []
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

function runCommand(cmd: string, args: readonly string[]): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code: number | null) => {
      const exitCode = code ?? 0
      resolve({
        passed: exitCode === 0,
        output: [stdout, stderr].filter(Boolean).join(''),
        exitCode,
      })
    })
  })
}
