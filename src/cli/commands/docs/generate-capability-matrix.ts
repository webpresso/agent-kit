/**
 * Generates a markdown capability matrix table from CAPABILITY_MATRIX.
 *
 * Reads the canonical hook event x vendor support grid from ir.ts and
 * formats it as a markdown table with symbol-prefixed support levels.
 */

import type { SupportLevel } from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js'
import { CAPABILITY_MATRIX } from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js'

const SYMBOL: Readonly<Record<SupportLevel, string>> = {
  full: '✅ full',
  partial: '⚠️ partial',
  unsupported: '❌ unsupported',
  unmapped: '❌ unmapped',
} as const

const FOOTER = [
  '',
  '*unmapped: event exists in vendor but is not mapped through Cursor\'s third-party compatibility layer*',
  '*unsupported: vendor does not support this event*',
  '*Source: catalog/agent/rules/supported-agent-clis.md*',
].join('\n')

export function generateCapabilityMatrix(): string {
  const header = '## Hook Capability Matrix\n'
  const tableHeader = '| Event | Claude Code | Codex CLI | Cursor |'
  const tableSeparator = '|---|---|---|---|'

  const rows = (Object.keys(CAPABILITY_MATRIX) as Array<keyof typeof CAPABILITY_MATRIX>).map(
    (event) => {
      const cap = CAPABILITY_MATRIX[event]
      return `| ${event} | ${SYMBOL[cap.claude]} | ${SYMBOL[cap.codex]} | ${SYMBOL[cap.cursor]} |`
    },
  )

  return [header, tableHeader, tableSeparator, ...rows, FOOTER].join('\n')
}
