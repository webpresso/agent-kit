/**
 * Integration tests for the coordinated 3-phase pretool-guard pipeline.
 *
 * Phase 1: Dev-workflow routing (deny → ak_* tools)
 * Phase 2: Sandbox routing (rewrite Bash → ctx_execute for data-heavy commands)
 * Phase 3: Security validators (block dangerous/forbidden commands)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:constants', () => ({
  O_CREAT: 0o100,
  O_EXCL: 0o200,
  O_WRONLY: 1,
}))
vi.mock('node:os', () => ({ tmpdir: () => '/tmp', homedir: () => '/home/test' }))

import { closeSync, openSync } from 'node:fs'

const mcpReady = vi.fn()

async function getRunner() {
  const { processValidation } = await import('./runner.js')
  return (inputJson: string) => processValidation(inputJson, mcpReady)
}

function makeBashInput(command: string): string {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } })
}

function makeEditInput(filePath: string): string {
  return JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
  })
}

describe('coordinated routing pipeline', () => {
  let stdoutOutput: string[]

  beforeEach(() => {
    vi.resetAllMocks()
    stdoutOutput = []

    // Default: MCP is ready (so Phase 1 dev-routing fires)
    mcpReady.mockReturnValue(true)

    // Default: openSync succeeds (first call for throttle marker)
    vi.mocked(openSync).mockReturnValue(3)
    vi.mocked(closeSync).mockReturnValue(undefined)

    // Capture stdout and exit
    vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutOutput.push(String(data))
      return true
    })
    vi.spyOn(console, 'log').mockImplementation((data: unknown) => {
      stdoutOutput.push(String(data))
    })
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit(${String(code)})`)
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function getLastOutput(): string {
    return stdoutOutput[stdoutOutput.length - 1] ?? ''
  }

  // Category 1: Dev-workflow commands → deny
  describe('Phase 1: dev-workflow → deny', () => {
    const devCommands = [
      'just test',
      'pnpm test',
      'pnpm exec vitest run',
      'vitest src/',
      'just lint',
      'pnpm exec oxlint .',
      'oxlint .',
      'just typecheck',
      'pnpm exec tsc --noEmit',
      'tsc --noEmit',
      'pnpm exec prettier README.md --write',
      'just qa',
      'pnpm qa',
      'just lint-md README.md',
      'pnpm exec markdownlint-cli2 README.md',
      'markdownlint-cli2 README.md',
    ]

    for (const cmd of devCommands) {
      it(`${cmd} → deny with permissionDecision`, async () => {
        const processValidation = await getRunner()
        try {
          processValidation(makeBashInput(cmd))
        } catch {
          // process.exit throws
        }
        const output = getLastOutput()
        const parsed = JSON.parse(output) as {
          hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string }
        }
        expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny')
        expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('ak_')
      })
    }
  })

  // Category 2: Data-heavy commands → sandbox
  describe('Phase 2: data-heavy → sandbox', () => {
    const sandboxCommands = [
      'grep -r foo src/',
      'find . -name "*.ts"',
      'cat package.json',
      'curl https://api.example.com',
      'git log --oneline',
      'pnpm build',
    ]

    for (const cmd of sandboxCommands) {
      it(`${cmd} → sandbox redirect`, async () => {
        const processValidation = await getRunner()
        try {
          processValidation(makeBashInput(cmd))
        } catch {
          // process.exit throws
        }
        const output = getLastOutput()
        const parsed = JSON.parse(output) as {
          hookSpecificOutput?: { permissionDecision?: string }
        }
        expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny')
        const reason = (
          parsed.hookSpecificOutput as { permissionDecisionReason?: string } | undefined
        )?.permissionDecisionReason
        expect(reason).toContain('ctx_')
      })
    }
  })

  // Category 3: Passthrough commands
  describe('Phase 3: safe commands → passthrough ({})', () => {
    const passthroughCommands = [
      'git status',
      'git add .',
      'git commit -m "msg"',
      'ls -la',
      'mkdir foo',
    ]

    for (const cmd of passthroughCommands) {
      it(`${cmd} → passthrough`, async () => {
        const processValidation = await getRunner()
        try {
          processValidation(makeBashInput(cmd))
        } catch {
          // process.exit throws
        }
        const output = getLastOutput()
        expect(output).toBe('{}')
      })
    }
  })

  // Category 5: Edit/Write inputs → fall through to validators (passthrough for safe files)
  describe('Edit/Write → pass through to validators', () => {
    it('Edit safe file → passthrough', async () => {
      const processValidation = await getRunner()
      try {
        processValidation(makeEditInput('src/foo.ts'))
      } catch {
        // process.exit throws
      }
      const output = getLastOutput()
      expect(output).toBe('{}')
    })
  })

  // Category 6: Unknown Bash → passthrough
  describe('Unknown Bash commands → passthrough', () => {
    it('some-random-tool --flag → passthrough', async () => {
      const processValidation = await getRunner()
      try {
        processValidation(makeBashInput('some-random-tool --flag'))
      } catch {
        // process.exit throws
      }
      const output = getLastOutput()
      expect(output).toBe('{}')
    })
  })

  // Category 7: Throttle behavior — second call passthrough
  describe('throttle: second dev-command call passes through', () => {
    it('second just test call → passthrough (guidance already shown)', async () => {
      const processValidation = await getRunner()

      // First call: deny (guidance shown)
      vi.mocked(openSync).mockReturnValueOnce(3)
      try {
        processValidation(makeBashInput('just test'))
      } catch {
        // process.exit throws
      }
      const firstOutput = getLastOutput()
      const firstParsed = JSON.parse(firstOutput) as {
        hookSpecificOutput?: { permissionDecision?: string }
      }
      expect(firstParsed.hookSpecificOutput?.permissionDecision).toBe('deny')

      stdoutOutput = []

      // Second call: EEXIST → passthrough
      vi.mocked(openSync).mockImplementationOnce(() => {
        const err = new Error('EEXIST') as NodeJS.ErrnoException
        err.code = 'EEXIST'
        throw err
      })
      try {
        processValidation(makeBashInput('just test'))
      } catch {
        // process.exit throws
      }
      const secondOutput = getLastOutput()
      expect(secondOutput).toBe('{}')
    })
  })

  // Category 7 extra: MCP not ready → dev-commands fall through (not denied)
  describe('MCP not ready → dev-workflow commands pass through', () => {
    it('just test with MCP not ready → passthrough (not denied)', async () => {
      mcpReady.mockReturnValue(false)
      const processValidation = await getRunner()
      try {
        processValidation(makeBashInput('just test'))
      } catch {
        // process.exit throws
      }
      const output = getLastOutput()
      // Should be passthrough {} since MCP is not ready (agent can't use ak_test)
      expect(output).toBe('{}')
    })
  })
})
