import type { ToolInput, ValidationResult } from '#hooks/shared/types'

import { getCommand, isBashInput } from '#hooks/shared/types'
import { createSkipResult } from './skip-result.js'

export const VALIDATOR_NAME = 'dangerous-commands'

interface DangerousPattern {
  pattern: RegExp
  description: string
}

const DANGEROUS_PATTERNS: DangerousPattern[] = [
  { pattern: /\bgit\s+push\s+.*--force\b/, description: 'git push --force can overwrite remote history' },
  { pattern: /\bgit\s+push\s+-f\b/, description: 'git push -f can overwrite remote history' },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+\/(?:\s|$)/,
    description: 'rm -rf / is catastrophically destructive',
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+~(?:\s|$|\/\s)/,
    description: 'rm -rf ~ deletes entire home directory',
  },
  { pattern: /\bgit\s+reset\s+--hard\b/, description: 'git reset --hard discards uncommitted changes' },
  { pattern: /\bgit\s+clean\s+.*-f/, description: 'git clean -f deletes untracked files permanently' },
  { pattern: /\bmkfs\b/, description: 'mkfs formats filesystems' },
  { pattern: /\bdd\s+.*of=\/dev\//, description: 'dd to device can overwrite disk' },
]

export function validateDangerousCommands(input: ToolInput): ValidationResult {
  if (process.env.DANGEROUS_COMMANDS_SKIP === '1') return createSkipResult(VALIDATOR_NAME)
  if (!isBashInput(input)) return createSkipResult(VALIDATOR_NAME, 'Not a Bash command')

  const command = getCommand(input)
  if (!command) return { validator: VALIDATOR_NAME, passed: true }

  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { validator: VALIDATOR_NAME, passed: false, message: `"${command}" → ${description}` }
    }
  }

  return { validator: VALIDATOR_NAME, passed: true }
}
