import { readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { RunnerEvent } from '#runners/types'
import { ClaudeSubagentRunner } from '#runners/claude-subagent/index'
import type { SubagentFn } from '#runners/claude-subagent/types'
import { assertEval1 } from './eval-1-add-function/assert.js'
import { assertEval2 } from './eval-2-multi-file-refactor/assert.js'
import { assertEval3 } from './eval-3-test-addition/assert.js'
import { assertEval4 } from './eval-4-dependency-bump/assert.js'
import { assertEval5 } from './eval-5-extract-package/assert.js'

const STUB_ERROR = 'not implemented — inject subagentFn'

// ---------------------------------------------------------------------------
// Eval shape
// ---------------------------------------------------------------------------

export interface Eval {
  readonly name: string
  readonly blueprintPath: string
  run(): Promise<EvalResult>
}

export interface EvalResult {
  readonly name: string
  readonly passed: boolean
  readonly skipped: boolean
  readonly events: readonly RunnerEvent[]
  readonly error?: string
}

// ---------------------------------------------------------------------------
// Built-in eval registry
//
// Each entry wires a named eval to its runner and assertion logic.
// The subagentFn can be injected for tests; when undefined it falls back
// to the real ClaudeSubagentRunner default (which requires ANTHROPIC_API_KEY).
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))

type AssertFn = (events: readonly RunnerEvent[]) => Promise<{ passed: boolean; reason?: string }>

function makeEval(
  name: string,
  description: string,
  assertFn: AssertFn,
  subagentFn?: SubagentFn,
): Eval {
  const blueprintPath = resolve(__dirname, name, 'blueprint.md')
  return {
    name,
    blueprintPath,
    async run(): Promise<EvalResult> {
      const runner =
        subagentFn !== undefined
          ? new ClaudeSubagentRunner('evals', subagentFn)
          : new ClaudeSubagentRunner('evals')

      const task = { id: name, description, permissions: 'workspace-write' as const }
      const ctx = { cwd: process.cwd() }
      const exec = runner.prepare(task, ctx)
      const events: RunnerEvent[] = []

      try {
        for await (const event of exec.run()) {
          events.push(event)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const skipped = message === STUB_ERROR
        return { name, passed: false, skipped, events, error: message }
      }

      const assertion = await assertFn(events)
      return { name, passed: assertion.passed, skipped: false, events, error: assertion.reason }
    },
  }
}

// ---------------------------------------------------------------------------
// Eval discovery and registration
// ---------------------------------------------------------------------------

function builtinEvals(subagentFn?: SubagentFn): readonly Eval[] {
  return [
    makeEval(
      'eval-1-add-function',
      'Add src/add.ts exporting add(a,b). Add src/add.test.ts asserting add(2,3)===5. pnpm test exits 0.',
      assertEval1,
      subagentFn,
    ),
    makeEval(
      'eval-2-multi-file-refactor',
      'Extract duplicated clamp() from src/a.ts and src/b.ts into src/utils/clamp.ts. Update imports.',
      assertEval2,
      subagentFn,
    ),
    makeEval(
      'eval-3-test-addition',
      'Add src/multiply.test.ts asserting multiply(3,4)===12 via toStrictEqual.',
      assertEval3,
      subagentFn,
    ),
    makeEval(
      'eval-4-dependency-bump',
      'Bump zod from ^3.22.0 to ^3.23.0 in package.json. Verify vp install succeeds.',
      assertEval4,
      subagentFn,
    ),
    makeEval(
      'eval-5-extract-package',
      'Extract src/math/ to packages/math/. Verify byte identity via diff -ru and mutation parity.',
      assertEval5,
      subagentFn,
    ),
  ]
}

// ---------------------------------------------------------------------------
// runAllEvals — discover and run all registered evals
// ---------------------------------------------------------------------------

export async function runAllEvals(subagentFn?: SubagentFn): Promise<EvalResult[]> {
  const evals = builtinEvals(subagentFn)
  const results: EvalResult[] = []

  for (const ev of evals) {
    const result = await ev.run()
    results.push(result)
  }

  return results
}

// ---------------------------------------------------------------------------
// CLI entrypoint — runs when executed directly via `pnpm eval`
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // List eval dirs for informational output
  const evalsDir = resolve(__dirname)
  let evalDirs: string[] = []
  try {
    const entries = await readdir(evalsDir, { withFileTypes: true })
    evalDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    // ignore — discovery is best-effort for the CLI summary
  }

  console.log(`Running ${evalDirs.length} eval suite(s)...\n`)

  const results = await runAllEvals()

  let anyFailed = false
  for (const result of results) {
    const status = result.passed ? '✓ PASS' : result.skipped ? '⚠ SKIP' : '✗ FAIL'
    console.log(`${status}  ${result.name}`)

    if (result.skipped) {
      console.log('       (no real backend — set ANTHROPIC_API_KEY to run evals)')
    } else if (!result.passed) {
      anyFailed = true
      if (result.error !== undefined) {
        console.log(`       reason: ${result.error}`)
      }
      const failureEvents = result.events.filter((e) => e.type === 'failed' || e.type === 'stderr')
      for (const ev of failureEvents) {
        if (ev.type === 'failed') console.log(`       error:  ${ev.error}`)
        else if (ev.type === 'stderr') console.log(`       stderr: ${ev.line}`)
      }
    }
  }

  const passed = results.filter((r) => r.passed).length
  const skipped = results.filter((r) => r.skipped).length
  const failed = results.filter((r) => !r.passed && !r.skipped).length
  console.log(`\n${passed} passed, ${skipped} skipped, ${failed} failed`)

  if (anyFailed) {
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('eval runner crashed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
