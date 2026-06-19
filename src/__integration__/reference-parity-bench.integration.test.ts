import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const fakePluginSha = '1111111111111111111111111111111111111111'
let tempDir: string | null = null

function resolveCommand(command: string): string {
  const result = spawnSync('which', [command], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`Unable to resolve required command for integration fixture: ${command}`)
  }
  return result.stdout.trim()
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content, 'utf8')
  chmodSync(path, 0o755)
}

function createBenchToolFixtureBin(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'reference-parity-bench-bin-'))
  const actualBun = resolveCommand('bun')
  const actualGit = resolveCommand('git')
  const actualNode = process.execPath

  writeExecutable(
    join(tempDir, 'bun'),
    `#!/usr/bin/env sh\nif [ "$1" = "--version" ]; then\n  echo "1.3.13"\n  exit 0\nfi\nexec ${JSON.stringify(actualBun)} "$@"\n`,
  )
  writeExecutable(
    join(tempDir, 'claude'),
    '#!/usr/bin/env sh\nif [ "$1" = "--version" ]; then\n  echo "2.1.183 (Claude Code)"\n  exit 0\nfi\necho "unexpected claude invocation: $*" >&2\nexit 2\n',
  )
  writeExecutable(
    join(tempDir, 'git'),
    `#!/usr/bin/env sh\nif [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "HEAD" ]; then\n  echo "${fakePluginSha}"\n  exit 0\nfi\nexec ${JSON.stringify(actualGit)} "$@"\n`,
  )
  writeExecutable(
    join(tempDir, 'node'),
    `#!/usr/bin/env sh\nif [ "$1" = "--version" ]; then\n  echo "v24.16.0"\n  exit 0\nfi\nexec ${JSON.stringify(actualNode)} "$@"\n`,
  )

  return tempDir
}

function runWpBenchDryRun(): { code: number; stdout: string; stderr: string } {
  const binDir = createBenchToolFixtureBin()
  const actualBun = resolveCommand('bun')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BUN: actualBun,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
  }
  delete env.WP_COMPILED_RUNTIME
  delete env.npm_lifecycle_event
  delete env.npm_lifecycle_script

  const result = spawnSync(actualBun, ['src/cli/cli.ts', 'bench', 'session-memory', '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  })

  return {
    code: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

describe('reference parity bench dry-run integration', () => {
  it('runs the real wp bench session-memory dry-run path without API calls or manifest drift', () => {
    const result = runWpBenchDryRun()

    expect(result.stderr).not.toContain('Manifest mismatch')
    expect(result.code, result.stderr).toBe(0)

    const parsed = JSON.parse(result.stdout) as {
      exitCode: number
      runId: string
      dryRun: boolean
      reportPath: string | null
      cellCount: number
      thresholdReport: {
        mode: 'dry-run'
        axes: Array<{ id: string; status: string; observed: unknown }>
      }
    }

    expect(parsed.exitCode).toBe(0)
    expect(parsed.runId).toMatch(/^[0-9a-f]{12}$/)
    expect(parsed.dryRun).toBe(true)
    expect(parsed.reportPath).toBeNull()
    expect(parsed.cellCount).toBe(3)
    expect(parsed.thresholdReport.mode).toBe('dry-run')
    expect(parsed.thresholdReport.axes.map((axis) => axis.id)).toEqual([
      'post_tool_capture_latency_ms',
      'precompact_snapshot_latency_ms',
      'startup_resume_injection_latency_ms',
      'search_quality_recall_at_5',
    ])
    expect(parsed.thresholdReport.axes.map((axis) => axis.status)).toEqual([
      'schema-valid',
      'schema-valid',
      'schema-valid',
      'schema-valid',
    ])
    expect(parsed.thresholdReport.axes.map((axis) => axis.observed)).toEqual([
      null,
      null,
      null,
      null,
    ])
  })
})
