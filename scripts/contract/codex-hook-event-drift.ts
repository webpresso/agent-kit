/**
 * Codex hook-event-name drift detector (scheduled, NON-required).
 *
 * `codex app-server generate-json-schema --out <DIR>` emits the JSON-RPC
 * app-server protocol. The authoritative list of hook events Codex supports
 * lives in `v2/HooksListResponse.json` → `definitions.HookEventName.enum`.
 * (The per-hook command stdin/stdout contract — permissionDecision /
 * hookSpecificOutput — is NOT emitted by this generator; it comes from the
 * Codex hooks docs and is pinned separately by codex-contract.test.ts.)
 *
 * This detector regenerates the schema and diffs that enum against a checked-in
 * golden. A diff means Codex added/renamed/removed a hook event upstream — a
 * signal to review our matcher coverage and golden contract. It is wired into a
 * scheduled workflow only, never required CI, so an upstream `codex` version
 * bump cannot turn the required gate red on its own.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

export const GOLDEN_RELATIVE_PATH = 'scripts/contract/codex-hook-event-names.golden.json'

/** The shape of a `HooksListResponse.json` we care about. */
type SchemaWithHookEventEnum = {
  readonly definitions?: {
    readonly HookEventName?: { readonly enum?: readonly unknown[] }
  }
}

export type CodexHookEventGolden = {
  readonly source: string
  readonly capturedFromCodexVersion: string
  readonly eventNames: readonly string[]
}

export type EventNameDiff = {
  readonly inSync: boolean
  readonly added: readonly string[]
  readonly removed: readonly string[]
}

/**
 * Pull the `HookEventName` enum out of a parsed `HooksListResponse` schema.
 * Throws on an unexpected shape rather than returning a silently-empty list —
 * an empty enum would make every real event look "removed".
 */
export function extractCodexHookEventNames(schema: unknown): readonly string[] {
  const enumValues = (schema as SchemaWithHookEventEnum)?.definitions?.HookEventName?.enum
  if (!Array.isArray(enumValues) || enumValues.length === 0) {
    throw new Error(
      'HookEventName enum not found in schema (expected definitions.HookEventName.enum) — generator layout may have changed',
    )
  }
  const names = enumValues.filter((value): value is string => typeof value === 'string')
  if (names.length !== enumValues.length) {
    throw new Error('HookEventName enum contained non-string members')
  }
  return names
}

/** Order-independent set diff between the live enum and the golden. */
export function diffEventNames(
  generated: readonly string[],
  golden: readonly string[],
): EventNameDiff {
  const generatedSet = new Set(generated)
  const goldenSet = new Set(golden)
  const added = generated.filter((name) => !goldenSet.has(name)).sort()
  const removed = golden.filter((name) => !generatedSet.has(name)).sort()
  return { inSync: added.length === 0 && removed.length === 0, added, removed }
}

export function loadGolden(repoRoot: string): CodexHookEventGolden {
  const raw = readFileSync(join(repoRoot, GOLDEN_RELATIVE_PATH), 'utf8')
  return JSON.parse(raw) as CodexHookEventGolden
}

/** Spawn `codex app-server generate-json-schema --out <dir>` with a deadline. */
function generateSchemas(outDir: string, deadlineMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('codex', ['app-server', 'generate-json-schema', '--out', outDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    // Bounded external boundary (catalog/agent/rules/no-timeout-as-fix): kill on
    // deadline rather than letting CI hang on a stuck generator.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`codex generate-json-schema exceeded ${deadlineMs}ms`))
    }, deadlineMs)
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`codex generate-json-schema exited ${code}${stderr ? `: ${stderr}` : ''}`))
    })
  })
}

export type DriftRunResult =
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'in-sync'; readonly eventNames: readonly string[] }
  | { readonly status: 'drift'; readonly diff: EventNameDiff }

/**
 * Full run: regenerate, extract, diff against golden. Returns `skipped` when
 * codex is unavailable (the scheduled job stays green; only real drift is red).
 */
export async function runCodexHookEventDrift(repoRoot: string): Promise<DriftRunResult> {
  const golden = loadGolden(repoRoot)
  const outDir = mkdtempSync(join(tmpdir(), 'codex-schema-'))
  try {
    try {
      await generateSchemas(outDir, 60_000)
    } catch (error) {
      return {
        status: 'skipped',
        reason: error instanceof Error ? error.message : String(error),
      }
    }
    const schema = JSON.parse(
      readFileSync(join(outDir, 'v2', 'HooksListResponse.json'), 'utf8'),
    ) as unknown
    const generated = extractCodexHookEventNames(schema)
    const diff = diffEventNames(generated, golden.eventNames)
    return diff.inSync ? { status: 'in-sync', eventNames: generated } : { status: 'drift', diff }
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const result = await runCodexHookEventDrift(process.cwd())
  if (result.status === 'skipped') {
    console.warn(`codex hook-event drift: SKIPPED — ${result.reason}`)
    return
  }
  if (result.status === 'in-sync') {
    console.log(`codex hook-event drift: IN SYNC (${result.eventNames.length} events)`)
    return
  }
  console.error('codex hook-event drift: DRIFT DETECTED')
  if (result.diff.added.length > 0) console.error(`  added upstream:   ${result.diff.added.join(', ')}`)
  if (result.diff.removed.length > 0) {
    console.error(`  removed upstream: ${result.diff.removed.join(', ')}`)
  }
  console.error(
    `  review .codex hook matchers + ${GOLDEN_RELATIVE_PATH}; update the golden once intentional.`,
  )
  process.exitCode = 1
}

if (import.meta.main) {
  void main()
}
