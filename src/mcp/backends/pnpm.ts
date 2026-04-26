import { spawn } from 'node:child_process'

import type { TestResult, TestRunInput } from './just.js'

export type { TestResult, TestRunInput } from './just.js'

/**
 * Run tests via `pnpm`.
 *
 * Argv shape:
 *   - `pnpm -F <p> test` once per package when packages are given (results
 *     aggregated; first non-zero exit wins).
 *   - `pnpm test -- <file1> <file2>` when files are given (no packages).
 *   - `pnpm test` otherwise.
 */
export async function runTests(input: TestRunInput): Promise<TestResult> {
  if (input.packages && input.packages.length > 0) {
    let combinedOutput = ''
    let firstFailure = 0
    for (const pkg of input.packages) {
      const result = await runCommand('pnpm', ['-F', pkg, 'test'])
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
    return runCommand('pnpm', ['test', '--', ...input.files])
  }

  return runCommand('pnpm', ['test'])
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
