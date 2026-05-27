/**
 * Integration tests for the coordinated 3-phase pretool-guard pipeline.
 *
 * Phase 1: Dev-workflow routing (deny → wp_* tools)
 * Phase 2: Sandbox routing (rewrite Bash → ctx_execute for data-heavy commands)
 * Phase 3: Security validators (block dangerous/forbidden commands)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function getRunner() {
  const { processValidation } = await import('./runner.js')
  return (inputJson: string) => processValidation(inputJson)
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

function makeContextExecuteInput(code: string): string {
  return JSON.stringify({
    tool_name: 'mcp__context_mode__ctx_execute',
    tool_input: { language: 'javascript', code },
  })
}

describe('coordinated routing pipeline', () => {
  let stdoutOutput: string[]

  beforeEach(() => {
    vi.resetAllMocks()
    stdoutOutput = []

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
      'vp exec vitest run',
      'vitest src/',
      'vp exec oxlint .',
      'oxlint .',
      'vp exec tsc --noEmit',
      'tsc --noEmit',
      'vp exec prettier README.md --write',
      'vp exec markdownlint-cli2 README.md',
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
        expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('wp_')
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
      'vp run build',
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

  describe('Context-mode dev-workflow commands → deny before execution', () => {
    it('ctx_execute wrapping vp test → deny with wp_test guidance', async () => {
      const processValidation = await getRunner()
      try {
        processValidation(
          makeContextExecuteInput(
            "execFileSync('vp',['run','--filter=webpresso','test'," +
              "'src/audit/gitignore-agent-surfaces.test.ts'])",
          ),
        )
      } catch {
        // process.exit throws
      }
      const output = getLastOutput()
      const parsed = JSON.parse(output) as {
        hookSpecificOutput?: {
          permissionDecision?: string
          permissionDecisionReason?: string
        }
      }
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny')
      expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('wp_test')
    })

    it('ctx_execute shell code with env-prefixed vitest → deny with wp_test guidance', async () => {
      const processValidation = await getRunner()
      try {
        processValidation(
          makeContextExecuteInput(
            'WP_SKIP_UPDATE_CHECK=1 vp exec vitest run src/mcp/blueprint-server.test.ts 2>&1 | tail -120',
          ),
        )
      } catch {
        // process.exit throws
      }
      const output = getLastOutput()
      const parsed = JSON.parse(output) as {
        hookSpecificOutput?: {
          permissionDecision?: string
          permissionDecisionReason?: string
        }
      }
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny')
      expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('wp_test')
    })
  })

  // Category 7: Repeated dev-workflow commands stay denied
  describe('dev-workflow denials stay hard-blocked', () => {
    it('vp exec vitest run → denied on repeated invocations', async () => {
      const processValidation = await getRunner()
      try {
        processValidation(makeBashInput('vp exec vitest run'))
      } catch {
        // process.exit throws
      }
      const firstOutput = getLastOutput()
      const firstParsed = JSON.parse(firstOutput) as {
        hookSpecificOutput?: { permissionDecision?: string }
      }
      expect(firstParsed.hookSpecificOutput?.permissionDecision).toBe('deny')

      stdoutOutput = []

      try {
        processValidation(makeBashInput('vp exec vitest run'))
      } catch {
        // process.exit throws
      }
      const secondOutput = getLastOutput()
      const secondParsed = JSON.parse(secondOutput) as {
        hookSpecificOutput?: { permissionDecision?: string }
      }
      expect(secondParsed.hookSpecificOutput?.permissionDecision).toBe('deny')
    })
  })
})
