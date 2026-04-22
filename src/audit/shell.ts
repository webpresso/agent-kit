/**
 * Minimal shell-command helper for audit scripts.
 *
 * Minimal inline replacement for the vendored process-utils runSystemCommand
 * helper. Covers the single
 * use case the audit scripts need: spawn a command, capture stdout/stderr,
 * return an exit code.
 */
import { spawn } from 'node:child_process'

export interface RunShellOptions {
  command: string
  args: string[]
  cwd?: string
}

export interface RunShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function runShell(options: RunShellOptions): Promise<RunShellResult> {
  return new Promise((resolve) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
  })
}
