#!/usr/bin/env node
import type { ToolInput, ValidationResult } from '#hooks/shared/types'

import { isGuardEnabled } from '#hooks/guard-switch/state'
import { readStdinJson, suppressStderr } from '#hooks/shared/hook-bootstrap'
import { buildDenyEnvelope, getCommand, getFilePath, isBashInput, parseToolInput } from '#hooks/shared/types'

import { logRun } from './logger.js'
import { extractRoutableCommandsFromToolInput, routeCommand } from './dev-routing.js'
import { VALIDATORS } from './validators/index.js'
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'

const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const NC = '\x1b[0m'

export interface AggregateResult {
  passed: boolean
  results: ValidationResult[]
  exitCode: 0 | 2
}

export function runAllValidators(input: ToolInput): AggregateResult {
  const results = VALIDATORS.map((v) => v(input))
  const failed = results.filter((r) => !r.passed)
  return { passed: !failed.length, results, exitCode: failed.length ? 2 : 0 }
}

export function formatOutput(aggregate: AggregateResult, input: ToolInput): void {
  const filePath = getFilePath(input) || 'unknown'
  if (!aggregate.passed) {
    const failed = aggregate.results.filter((r) => !r.passed)
    console.error(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`)
    console.error(`${RED}❌ Pretool Guard: BLOCKED${NC}`)
    console.error(`${RED}   File: ${filePath}${NC}`)
    console.error(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`)
    for (const result of failed) {
      console.error(
        `${RED}   • [${result.validator}] ${result.message || 'Validation failed'}${NC}`,
      )
    }
    console.error(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`)
    return
  }

  const warnings = aggregate.results.filter((r) => r.passed && r.message)
  for (const warning of warnings) {
    console.error(`${YELLOW}⚠️  [${warning.validator}] ${warning.message}${NC}`)
  }

  if (process.env.PRETOOL_VERBOSE === '1') {
    const skipped = aggregate.results.filter((r) => r.skipped)
    for (const skip of skipped) {
      console.error(`${DIM}⏭️  [${skip.validator}] Skipped: ${skip.skipReason}${NC}`)
    }
    console.error(`${DIM}✅ Pretool Guard: PASSED${NC}`)
  }

  console.log('{}')
}

export function getToolType(input: ToolInput): 'Bash' | 'Write' | 'Edit' {
  if (isBashInput(input)) return 'Bash'
  if (getFilePath(input)) return 'Write'
  return 'Edit'
}

export function getTarget(input: ToolInput): string {
  return getFilePath(input) || getCommand(input) || 'unknown'
}

export function logValidationResult(
  result: AggregateResult,
  target: string,
  tool: 'Bash' | 'Write' | 'Edit',
): void {
  if (!result.passed) {
    const failed = result.results.filter((r) => !r.passed)
    logRun({
      status: 'BLOCK',
      target: target.slice(0, 100),
      tool,
      failures: failed.map((f) => f.validator),
    })
    return
  }
  const warnings = result.results.filter((r) => r.passed && r.message)
  logRun({
    status: warnings.length > 0 ? 'WARN' : 'PASS',
    target: target.slice(0, 100),
    tool,
    failures: warnings.length > 0 ? warnings.map((w) => w.validator) : undefined,
  })
}

export function handleParseError(error: unknown, inputJson: string): never {
  logRun({
    status: 'ERROR',
    target: inputJson.slice(0, 50).replace(/\n/g, ' '),
    tool: 'Bash',
    error: error instanceof Error ? error.message : String(error),
  })
  console.error(`${RED}❌ Pretool Guard: Error parsing input${NC}`)
  console.error(`${RED}   ${error instanceof Error ? error.message : 'Unknown error'}${NC}`)
  process.exit(2)
}

function generateLogId(): string {
  return crypto.randomUUID().slice(0, 8)
}

function writeDenyDecision(permissionDecisionReason: string): void {
  process.stdout.write(
    JSON.stringify(buildDenyEnvelope({ reason: permissionDecisionReason, logId: generateLogId() })),
  )
}

export function processValidation(inputJson: string): void {
  if (!isGuardEnabled()) {
    console.log('{}')
    process.exit(0)
  }

  const input = parseToolInput(inputJson)
  const command = isBashInput(input) ? getCommand(input) : null
  const routableCommands = [
    ...(command ? [{ command, alreadySandboxed: false }] : []),
    ...extractRoutableCommandsFromToolInput(input).map((routedCommand) => ({
      command: routedCommand,
      alreadySandboxed: true,
    })),
  ]

  for (const routedCommand of routableCommands) {
    const decision = routeCommand(routedCommand.command)
    if (decision !== null) {
      if (decision.action.action === 'deny') {
        // Phase 1: Dev-workflow routing — always authoritative (MCP-first)
        writeDenyDecision(decision.action.guidance)
        process.exit(0)
      } else if (decision.action.action === 'sandbox' && !routedCommand.alreadySandboxed) {
        // Phase 2: Context-mode sandbox routing — fire only for raw tool calls.
        // Commands already inside ctx_execute/ctx_batch_execute are already in
        // the requested sandbox; re-denying them creates a ctx_execute loop.
        writeDenyDecision(decision.action.guidance)
        process.exit(0)
      }
      // 'passthrough' or already-sandboxed sandbox redirects → Phase 3
    }
  }

  // Phase 3: Security validators (existing pipeline)
  const target = getTarget(input)
  const tool = getToolType(input)
  const result = runAllValidators(input)
  logValidationResult(result, target, tool)
  formatOutput(result, input)
  process.exit(result.exitCode)
}

export async function main(): Promise<void> {
  suppressStderr()
  const inputJson = await readStdinJson()

  if (!inputJson.trim()) {
    console.log('{}')
    process.exit(0)
  }

  try {
    processValidation(inputJson)
  } catch (error) {
    handleParseError(error, inputJson)
  }
}

if (
  isDirectEntrypoint(import.meta.url)
) {
  main()
}
