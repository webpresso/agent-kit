import { closeSync, openSync } from 'node:fs'
import { O_CREAT, O_EXCL, O_WRONLY } from 'node:constants'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type GuidanceType = 'test' | 'lint' | 'typecheck' | 'qa'

export type DevRoutingDecision = { action: 'deny'; guidance: string }

interface RoutingRule {
  prefixes: string[]
  guidanceType: GuidanceType
  guidance: string
}

const ROUTING_RULES: RoutingRule[] = [
  {
    prefixes: ['just test', 'pnpm test', 'vitest'],
    guidanceType: 'test',
    guidance: 'Use ak_test MCP tool instead — returns {passed, summary} not raw logs',
  },
  {
    prefixes: ['just lint', 'pnpm lint', 'oxlint'],
    guidanceType: 'lint',
    guidance: 'Use ak_lint MCP tool instead — returns {passed, violations[]}',
  },
  {
    prefixes: ['just typecheck', 'pnpm typecheck', 'tsc'],
    guidanceType: 'typecheck',
    guidance: 'Use ak_typecheck MCP tool instead — returns {passed, errors[]}',
  },
  {
    prefixes: ['just qa', 'pnpm qa'],
    guidanceType: 'qa',
    guidance: 'Use ak_qa MCP tool instead — runs lint+typecheck+test and returns combined summary',
  },
]

const PASSTHROUGH_PREFIXES = ['just audit', 'ak audit']

function matchesPrefix(command: string, prefix: string): boolean {
  return command === prefix || command.startsWith(prefix + ' ')
}

function markerPath(sessionId: string | undefined, guidanceType: GuidanceType): string {
  const key = sessionId ?? String(process.ppid)
  return join(tmpdir(), `ak-routing-guidance-${key}-${guidanceType}`)
}

function shouldThrottle(sessionId: string | undefined, guidanceType: GuidanceType, guidance: string): DevRoutingDecision | null {
  const path = markerPath(sessionId, guidanceType)
  try {
    const fd = openSync(path, O_CREAT | O_EXCL | O_WRONLY)
    closeSync(fd)
    return { action: 'deny', guidance } // first time — show guidance
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null // already shown this session
    return { action: 'deny', guidance } // non-EEXIST (NFS etc) — always deny
  }
}

export function routeDevCommand(command: string, sessionId?: string): DevRoutingDecision | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  // Check explicit passthroughs first
  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (matchesPrefix(trimmed, prefix)) return null
  }

  // Check routing rules
  for (const rule of ROUTING_RULES) {
    for (const prefix of rule.prefixes) {
      if (matchesPrefix(trimmed, prefix)) {
        return shouldThrottle(sessionId, rule.guidanceType, rule.guidance)
      }
    }
  }

  return null
}
