import { readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { RunnerEvent } from '../types.js'
import { ClaudeSubagentRunner } from '../claude-subagent/index.js'
import type { SubagentFn } from '../claude-subagent/types.js'
import { assertEval1 } from './eval-1-add-function/assert.js'

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

function makeEval1(subagentFn?: SubagentFn): Eval {
  const name = 'eval-1-add-function'
  const blueprintPath = resolve(__dirname, 'eval-1-add-function', 'blueprint.md')

  return {
    name,
    blueprintPath,
    async run(): Promise<EvalResult> {
      const runner = subagentFn !== undefined
        ? new ClaudeSubagentRunner('evals', subagentFn)
        : new ClaudeSubagentRunner('evals')

      const task = {
        id: name,
        description:
          'Add src/add.ts exporting add(a, b) that returns a + b. Add src/add.test.ts asserting add(2,3)===5. pnpm test src/add.test.ts exits 0.',
        permissions: 'workspace-write' as const,
      }

      const ctx = { cwd: process.cwd() }
      const exec = runner.prepare(task, ctx)
      const events: RunnerEvent[] = []

      try {
        for await (const event of exec.run()) {
          events.push(event)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { name, passed: false, events, error: message }
      }

      const assertion = await assertEval1(events)
      return {
        name,
        passed: assertion.passed,
        events,
        error: assertion.reason,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Eval discovery and registration
// ---------------------------------------------------------------------------

function builtinEvals(subagentFn?: SubagentFn): readonly Eval[] {
  return [makeEval1(subagentFn)]
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
    evalDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    // ignore — discovery is best-effort for the CLI summary
  }

  console.log(`Running ${evalDirs.length} eval suite(s)...\n`)

  const results = await runAllEvals()

  let anyFailed = false
  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL'
    console.log(`${status}  ${result.name}`)

    if (!result.passed) {
      anyFailed = true
      if (result.error !== undefined) {
        console.log(`       reason: ${result.error}`)
      }
      const failureEvents = result.events.filter(
        (e) => e.type === 'failed' || e.type === 'stderr',
      )
      for (const ev of failureEvents) {
        if (ev.type === 'failed') {
          console.log(`       error:  ${ev.error}`)
        } else if (ev.type === 'stderr') {
          console.log(`       stderr: ${ev.line}`)
        }
      }
    }
  }

  console.log(`\n${results.filter((r) => r.passed).length}/${results.length} evals passed`)

  if (anyFailed) {
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('eval runner crashed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
