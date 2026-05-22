import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { TestResult, TestRunInput } from './just.js'

export type { TestResult, TestRunInput } from './just.js'

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
    for (const pkg of input.packages) {
      const result = await runPackageScopedTests(cwd, pkg, input.files)
      combinedOutput += result.output
      if (!result.passed && firstFailure === 0) firstFailure = result.exitCode
    }
    return {
      passed: firstFailure === 0,
      output: combinedOutput,
      exitCode: firstFailure,
    }
  }

  if (input.files && input.files.length > 0) {
    if (usesVitest(cwd)) {
      return runCommand('vp', ['exec', '--', 'vitest', 'run', '--reporter=json', '--no-color', ...input.files], cwd)
    }
    return runCommand('vp', ['run', 'test', '--', ...input.files], cwd)
  }

  if (usesVitest(cwd)) {
    return runCommand('vp', ['exec', '--', 'vitest', 'run', '--reporter=json', '--no-color'], cwd)
  }

  return runCommand('vp', ['run', 'test'], cwd)
}

function runPackageScopedTests(
  cwd: string,
  packageName: string,
  files?: readonly string[],
): Promise<TestResult> {
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
      cwd,
    )
  }

  if (files && files.length > 0) {
    return runCommand('vp', ['run', '--filter', packageName, 'test', '--', ...files], cwd)
  }

  return runCommand('vp', ['run', '--filter', packageName, 'test'], cwd)
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

function runCommand(cmd: string, args: readonly string[], cwd?: string): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args], cwd ? { cwd } : {})
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
