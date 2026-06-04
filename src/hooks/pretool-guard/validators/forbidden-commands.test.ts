import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ToolInput } from '#hooks/shared/types'

import {
  applySuggestionModifiers,
  BLOCKED_RAW_NODE_MODULE_TOOLS,
  BLOCKED_SCRIPTS,
  BLOCKED_TOOLS,
  COMMAND_RULES,
  createAuditResult,
  createBlockedResult,
  findMatchingRule,
  generateRules,
  getCommandCategory,
  getCommandVariants,
  getApprovedEquivalent,
  SKIP_ENV_VAR,
  AUDIT_MODE_ENV,
  SUGGESTION_MODIFIERS,
  splitTopLevelCommands,
  VALIDATOR_NAME,
  validateForbiddenCommands,
} from './forbidden-commands.js'

const RAW_NODE_MODULE_TOOL_CASES = [
  {
    command: 'node ./node_modules/vitest/vitest.mjs run src/example.test.ts',
    category: 'test',
    suggestion: 'wp_test',
  },
  {
    command: 'node ./node_modules/typescript/bin/tsc --noEmit --pretty false',
    category: 'typecheck',
    suggestion: 'wp_typecheck',
  },
  {
    command: 'node ./node_modules/oxlint/bin/oxlint src',
    category: 'lint',
    suggestion: 'wp_lint',
  },
] as const

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------
describe('exported constants', () => {
  it('VALIDATOR_NAME is forbidden-commands', () => {
    expect(VALIDATOR_NAME).toBe('forbidden-commands')
  })

  it('SKIP_ENV_VAR is FORBIDDEN_COMMANDS_SKIP', () => {
    expect(SKIP_ENV_VAR).toBe('FORBIDDEN_COMMANDS_SKIP')
  })

  it('AUDIT_MODE_ENV is FORBIDDEN_COMMANDS_AUDIT', () => {
    expect(AUDIT_MODE_ENV).toBe('FORBIDDEN_COMMANDS_AUDIT')
  })

  it('BLOCKED_TOOLS is a non-empty array', () => {
    expect(BLOCKED_TOOLS.length).toBeGreaterThan(0)
  })

  it('BLOCKED_SCRIPTS is a non-empty array', () => {
    expect(BLOCKED_SCRIPTS.length).toBeGreaterThan(0)
  })

  it('BLOCKED_RAW_NODE_MODULE_TOOLS covers raw wrappers audited in session', () => {
    expect(BLOCKED_RAW_NODE_MODULE_TOOLS.map(({ modulePath }) => modulePath)).toStrictEqual([
      'vitest/vitest.mjs',
      'typescript/bin/tsc',
      'oxlint/bin/oxlint',
    ])
  })

  it('COMMAND_RULES is a non-empty array', () => {
    expect(COMMAND_RULES.length).toBeGreaterThan(0)
  })

  it('SUGGESTION_MODIFIERS is a non-empty array', () => {
    expect(SUGGESTION_MODIFIERS.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// generateRules
// ---------------------------------------------------------------------------
describe('generateRules', () => {
  it('returns a non-empty array of CommandRule objects', () => {
    const rules = generateRules()
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.pattern).toBeInstanceOf(RegExp)
      expect(typeof rule.category).toBe('string')
      expect(typeof rule.suggestion).toBe('string')
    }
  })

  it('includes vp exec vitest as a blocked rule', () => {
    const rules = generateRules()
    const vitestRule = rules.find((r) => r.pattern.test('vp exec vitest'))
    expect(vitestRule).toBeDefined()
    expect(vitestRule!.suggestion).toContain('wp_test')
  })

  it('includes package-runner vitest aliases as blocked rules', () => {
    const rules = generateRules()
    for (const command of [
      'pnpm exec vitest run',
      'npm exec vitest run',
      'npm exec -- vitest run',
      'npx vitest run',
      'yarn vitest run',
      'yarn exec vitest run',
      'bunx vitest run',
    ]) {
      const vitestRule = rules.find((rule) => rule.pattern.test(command))
      expect(vitestRule, command).toBeDefined()
      expect(vitestRule!.suggestion, command).toContain('wp_test')
    }
  })

  it('includes raw node_modules tool wrappers as blocked rules', () => {
    const rules = generateRules()

    for (const { command, suggestion } of RAW_NODE_MODULE_TOOL_CASES) {
      const rule = rules.find((r) => r.pattern.test(command))
      expect(rule, command).toBeDefined()
      expect(rule!.suggestion, command).toContain(suggestion)
    }
  })

  it('includes vp run test as a blocked rule', () => {
    const rules = generateRules()
    const testScriptRule = rules.find((r) => r.pattern.test('vp run test'))
    expect(testScriptRule).toBeDefined()
    expect(testScriptRule!.suggestion).toContain('wp_test')
  })

  it('includes doppler run as a blocked rule', () => {
    const rules = generateRules()
    const dopplerRule = rules.find((r) => r.pattern.test('doppler run'))
    expect(dopplerRule).toBeDefined()
  })

  it('includes vp exec as a blocked rule', () => {
    const rules = generateRules()
    const vpExecRule = rules.find((r) => r.pattern.test('vp exec something'))
    expect(vpExecRule).toBeDefined()
  })

  it('includes vp exec markdownlint-cli2 as a blocked rule that points at qa', () => {
    const rules = generateRules()
    const rule = rules.find((r) => r.pattern.test('vp exec markdownlint-cli2 README.md'))
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_qa')
  })
})

// ---------------------------------------------------------------------------
// findMatchingRule
// ---------------------------------------------------------------------------
describe('findMatchingRule', () => {
  it('matches vp vitest and returns the correct rule', () => {
    const rule = findMatchingRule('vp vitest')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_test')
  })

  it('matches vp run test', () => {
    const rule = findMatchingRule('vp run test')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_test')
  })

  it('matches vp exec tsc', () => {
    const rule = findMatchingRule('vp exec tsc')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('typecheck')
  })

  it('matches doppler run command', () => {
    const rule = findMatchingRule('doppler run node script.js')
    expect(rule).toBeDefined()
  })

  it('matches vp exec command', () => {
    const rule = findMatchingRule('vp exec some-tool')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('unknown')
  })

  it('matches vp exec command', () => {
    const rule = findMatchingRule('vp exec drizzle-kit generate')
    expect(rule).toBeDefined()
  })

  it('matches vp exec vitest with arguments', () => {
    const rule = findMatchingRule('vp exec vitest --run --reporter verbose')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_test')
  })

  it('matches vp --filter exec vitest with arguments', () => {
    const rule = findMatchingRule('vp --filter @repo/platform-web exec vitest run')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_test')
  })

  it('matches vp --filter run test', () => {
    const rule = findMatchingRule('vp --filter @repo/platform-web run test')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_test')
  })

  it('matches vp --filter exec tsc', () => {
    const rule = findMatchingRule('vp --filter @repo/platform-web exec tsc --noEmit')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('typecheck')
  })

  it('matches vp --filter exec oxlint', () => {
    const rule = findMatchingRule('vp --filter @repo/platform-web exec oxlint .')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('lint')
  })

  it('matches vp -F exec vitest', () => {
    const rule = findMatchingRule('vp -F @repo/platform-web exec vitest run')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('test')
  })

  it('matches vp --workspace-root exec tsc', () => {
    const rule = findMatchingRule('vp --workspace-root exec tsc --noEmit')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('typecheck')
  })

  it('matches vp -w exec oxlint', () => {
    const rule = findMatchingRule('vp -w exec oxlint .')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('lint')
  })

  it('matches vp --workspace-root run test', () => {
    const rule = findMatchingRule('vp --workspace-root run test')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('test')
  })

  it('matches vp --dir exec vitest', () => {
    const rule = findMatchingRule('vp --dir apps/platform/web/platform-web exec vitest run')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('test')
  })

  it('matches vp -F run test', () => {
    const rule = findMatchingRule('vp -F @repo/platform-web run test')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('test')
  })

  it('matches vp -C run test', () => {
    const rule = findMatchingRule('vp -C apps/platform/web/platform-web run test')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('test')
  })

  it('matches vp --filter run lint --fix', () => {
    const rule = findMatchingRule('vp --filter @repo/platform-web run lint --fix')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('lint')
  })

  it('matches vp --workspace-root run typecheck', () => {
    const rule = findMatchingRule('vp --workspace-root run typecheck')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('typecheck')
  })

  it('matches vp --dir run lint --fix', () => {
    const rule = findMatchingRule('vp --dir apps/platform/web/platform-web run lint --fix')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('lint')
  })

  it('returns undefined for an unrelated vp command', () => {
    expect(findMatchingRule('vp --version')).toBeUndefined()
  })

  it('returns undefined for empty command', () => {
    expect(findMatchingRule('')).toBeUndefined()
  })

  it('returns undefined for unrelated shell command', () => {
    expect(findMatchingRule('echo hello')).toBeUndefined()
  })

  it('matches commands split by &&', () => {
    const rule = findMatchingRule('echo done && vp run test')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_test')
  })

  it('matches commands split by ;', () => {
    const rule = findMatchingRule('ls; vp vitest')
    expect(rule).toBeDefined()
  })

  it('matches DATABASE_URL= inline env var', () => {
    const rule = findMatchingRule('DATABASE_URL=postgres://... vp exec drizzle-kit push')
    expect(rule).toBeDefined()
  })

  it('does not match partial commands', () => {
    expect(findMatchingRule('vp linty')).toBeUndefined()
  })

  it('matches vp typecheck', () => {
    const rule = findMatchingRule('vp typecheck')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('typecheck')
  })

  it('matches vp exec oxlint', () => {
    const rule = findMatchingRule('vp exec oxlint')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('lint')
  })

  it('matches vp exec markdownlint-cli2', () => {
    const rule = findMatchingRule('vp exec markdownlint-cli2 README.md')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_qa')
  })

  it('matches package-runner vitest aliases', () => {
    for (const command of [
      'pnpm exec vitest run',
      'npm exec vitest run',
      'npm exec -- vitest run',
      'npx vitest run',
      'yarn vitest run',
      'yarn exec vitest run',
      'bunx vitest run',
    ]) {
      const rule = findMatchingRule(command)
      expect(rule, command).toBeDefined()
      expect(rule!.category, command).toBe('test')
      expect(rule!.suggestion, command).toContain('wp_test')
    }
  })

  it('matches raw node_modules tool wrappers', () => {
    for (const { command, category, suggestion } of RAW_NODE_MODULE_TOOL_CASES) {
      const rule = findMatchingRule(command)
      expect(rule, command).toBeDefined()
      expect(rule!.category, command).toBe(category)
      expect(rule!.suggestion, command).toContain(suggestion)
    }
  })
})

// ---------------------------------------------------------------------------
// applySuggestionModifiers
// ---------------------------------------------------------------------------
describe('applySuggestionModifiers', () => {
  it('returns the modifier suggestion when --fix flag is present for lint', () => {
    const rule = { pattern: /^vp run lint/, category: 'lint' as const, suggestion: 'vp run lint' }
    expect(applySuggestionModifiers('vp run lint --fix', rule)).toContain('--fix')
  })

  it('returns the modifier suggestion when --write flag is present for lint', () => {
    const rule = {
      pattern: /^vp exec oxlint/,
      category: 'lint' as const,
      suggestion: 'vp run lint',
    }
    expect(applySuggestionModifiers('vp exec oxlint --write', rule)).toContain('--fix')
  })

  it('returns the modifier suggestion for --fix-dangerous flag', () => {
    const rule = {
      pattern: /^vp exec oxfmt/,
      category: 'lint' as const,
      suggestion: 'wp_format MCP tool',
    }
    expect(applySuggestionModifiers('vp exec oxfmt --fix-dangerous', rule)).toContain(
      '--fix-unsafe',
    )
  })

  it('returns default suggestion when modifier does not match category', () => {
    const rule = {
      pattern: /^vp exec stryker/,
      category: 'test' as const,
      suggestion: 'wp_test mutation workflow',
    }
    expect(applySuggestionModifiers('vp exec stryker run', rule)).toBe('wp_test mutation workflow')
  })

  it('returns default suggestion when no modifier pattern matches', () => {
    const rule = {
      pattern: /^vp exec tsc/,
      category: 'typecheck' as const,
      suggestion: 'wp_typecheck MCP tool with package/file scope',
    }
    expect(applySuggestionModifiers('vp exec tsc --noEmit', rule)).toBe(
      'wp_typecheck MCP tool with package/file scope',
    )
  })
})

// ---------------------------------------------------------------------------
// getApprovedEquivalent
// ---------------------------------------------------------------------------
describe('getApprovedEquivalent', () => {
  it('returns approved equivalent for vp vitest', () => {
    expect(getApprovedEquivalent('vp vitest')).toContain('wp_test')
  })

  it('returns approved equivalent for vp run test', () => {
    expect(getApprovedEquivalent('vp run test')).toContain('wp_test')
  })

  it('returns approved equivalent for vp exec tsc', () => {
    expect(getApprovedEquivalent('vp exec tsc')).toContain('wp_typecheck')
  })

  it('returns approved equivalent for vp exec oxlint', () => {
    expect(getApprovedEquivalent('vp exec oxlint')).toContain('wp_lint')
  })

  it('returns qa MCP guidance for vp exec markdownlint-cli2', () => {
    expect(getApprovedEquivalent('vp exec markdownlint-cli2 README.md')).toContain('wp_qa')
  })

  it('returns generic message for unknown command', () => {
    expect(getApprovedEquivalent('echo hello')).toBe('repo-approved MCP/tooling entrypoint')
  })

  it('returns generic message for empty command', () => {
    expect(getApprovedEquivalent('')).toBe('repo-approved MCP/tooling entrypoint')
  })
})

// ---------------------------------------------------------------------------
// getCommandVariants
// ---------------------------------------------------------------------------
describe('getCommandVariants', () => {
  it('returns a single variant for a plain command', () => {
    const variants = getCommandVariants('vp vitest')
    expect(variants).toEqual(['vp vitest'])
  })

  it('splits chained commands by &&', () => {
    const variants = getCommandVariants('echo done && vp run test')
    expect(variants).toContain('echo done')
    expect(variants).toContain('vp run test')
  })

  it('splits commands by ;', () => {
    const variants = getCommandVariants('ls; vp vitest')
    expect(variants).toContain('ls')
    expect(variants).toContain('vp vitest')
  })

  it('splits commands by ||', () => {
    const variants = getCommandVariants('vp vitest || echo failed')
    expect(variants).toContain('vp vitest')
    expect(variants).toContain('echo failed')
  })

  it('splits commands by |', () => {
    const variants = getCommandVariants('vp vitest | grep FAIL')
    expect(variants).toContain('vp vitest')
    expect(variants).not.toContain('grep FAIL')
  })

  it('returns empty array for empty string', () => {
    expect(getCommandVariants('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(getCommandVariants('   ')).toEqual([])
  })

  it('extracts before-pipe segments when command starts with vp', () => {
    const variants = getCommandVariants('vp run test --package foo | grep PASS')
    expect(variants).toContain('vp run test --package foo')
    // The vp branch splits by logical operators but pipes are extracted
    // via the before-pipe logic, not as separate command variants
    expect(variants).toContain('vp run test --package foo | grep PASS')
  })

  it('splits vp command segments by logical operators', () => {
    const variants = getCommandVariants(
      'vp run test --package foo && vp run typecheck --package foo',
    )
    expect(variants).toContain('vp run test --package foo')
    expect(variants).toContain('vp run typecheck --package foo')
  })
})

// ---------------------------------------------------------------------------
// getCommandCategory
// ---------------------------------------------------------------------------
describe('getCommandCategory', () => {
  it('returns test for vp vitest', () => {
    expect(getCommandCategory('vp vitest')).toBe('test')
  })

  it('returns lint for vp run lint', () => {
    expect(getCommandCategory('vp run lint')).toBe('lint')
  })

  it('returns typecheck for vp exec tsc', () => {
    expect(getCommandCategory('vp exec tsc')).toBe('typecheck')
  })

  it('returns unknown for vp exec command', () => {
    expect(getCommandCategory('vp exec something')).toBe('unknown')
  })

  it('returns unknown for unrelated vp command', () => {
    expect(getCommandCategory('vp --version')).toBe('unknown')
  })

  it('returns unknown for empty command', () => {
    expect(getCommandCategory('')).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// createBlockedResult
// ---------------------------------------------------------------------------
describe('createBlockedResult', () => {
  it('returns a failed validation result', () => {
    const rule = findMatchingRule('vp vitest')!
    const result = createBlockedResult('vp vitest', rule, { mcpReady: true })
    expect(result.validator).toBe(VALIDATOR_NAME)
    expect(result.passed).toBe(false)
    expect(result.command).toBe('vp vitest')
    expect(result.category).toBe('test')
    expect(result.message).toContain('vp vitest')
    expect(result.message).toContain('mcp__webpresso__wp_test(...)')
    expect(result.message).toContain('Fallback if MCP unavailable:')
    expect(result.docsRef).toBeDefined()
    expect(result.matchedPattern).toBeDefined()
  })

  it('includes suggestion in the message', () => {
    const rule = findMatchingRule('vp exec tsc')!
    const result = createBlockedResult('vp exec tsc', rule, { mcpReady: false })
    expect(result.suggestion).toContain('wp_typecheck')
    expect(result.message).toContain(result.suggestion)
  })

  it('filters through suggestion modifiers', () => {
    const rule = {
      pattern: /^vp exec oxfmt/,
      category: 'lint' as const,
      suggestion: 'wp_format MCP tool',
    }
    const result = createBlockedResult('vp exec oxfmt --fix-dangerous', rule)
    expect(result.suggestion).toContain('--fix-unsafe')
  })
})

// ---------------------------------------------------------------------------
// createAuditResult
// ---------------------------------------------------------------------------
describe('createAuditResult', () => {
  it('returns a passed result with audit prefix', () => {
    const rule = findMatchingRule('vp vitest')!
    const result = createAuditResult('vp vitest', rule, { mcpReady: true })
    expect(result.validator).toBe(VALIDATOR_NAME)
    expect(result.passed).toBe(true)
    expect(result.message).toContain('[AUDIT] Would block')
    expect(result.command).toBe('vp vitest')
    expect(result.message).toContain('mcp__webpresso__wp_test(...)')
    expect(result.docsRef).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// validateForbiddenCommands (integrated)
// ---------------------------------------------------------------------------
describe('validateForbiddenCommands', () => {
  function bashInput(command: string): ToolInput {
    return { tool_input: { command } }
  }

  function nonBashInput(filePath: string): ToolInput {
    return { tool_input: { file_path: filePath } }
  }

  it('returns skipped when input is not a Bash command', () => {
    const result = validateForbiddenCommands(nonBashInput('src/index.ts'))
    expect(result.skipped).toBe(true)
  })

  it('returns skipped when command is empty', () => {
    const input: ToolInput = { tool_input: { command: '' } }
    const result = validateForbiddenCommands(input)
    expect(result.skipped).toBe(true)
    expect(result.skipReason).toContain('No command found')
  })

  it('returns skipped when no command key exists', () => {
    const input: ToolInput = { tool_input: {} }
    const result = validateForbiddenCommands(input)
    expect(result.skipped).toBe(true)
  })

  it('blocks vp vitest', () => {
    const result = validateForbiddenCommands(bashInput('vp vitest'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp vitest')
    expect('command' in result && result.suggestion).toContain('wp_test')
  })

  it('blocks vp --filter exec vitest', () => {
    const result = validateForbiddenCommands(
      bashInput('vp --filter @repo/platform-web exec vitest run'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe(
      'vp --filter @repo/platform-web exec vitest run',
    )
  })

  it('blocks vp --filter run test', () => {
    const result = validateForbiddenCommands(bashInput('vp --filter @repo/platform-web run test'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp --filter @repo/platform-web run test')
  })

  it('blocks vp --filter exec oxlint', () => {
    const result = validateForbiddenCommands(
      bashInput('vp --filter @repo/platform-web exec oxlint .'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe(
      'vp --filter @repo/platform-web exec oxlint .',
    )
  })

  it('blocks vp -F exec vitest', () => {
    const result = validateForbiddenCommands(bashInput('vp -F @repo/platform-web exec vitest run'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp -F @repo/platform-web exec vitest run')
  })

  it('blocks vp --workspace-root exec tsc', () => {
    const result = validateForbiddenCommands(bashInput('vp --workspace-root exec tsc --noEmit'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp --workspace-root exec tsc --noEmit')
  })

  it('blocks vp -w exec oxlint', () => {
    const result = validateForbiddenCommands(bashInput('vp -w exec oxlint .'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp -w exec oxlint .')
  })

  it('blocks vp --workspace-root run test', () => {
    const result = validateForbiddenCommands(bashInput('vp --workspace-root run test'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp --workspace-root run test')
  })

  it('blocks vp --dir exec vitest', () => {
    const result = validateForbiddenCommands(
      bashInput('vp --dir apps/platform/web/platform-web exec vitest run'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe(
      'vp --dir apps/platform/web/platform-web exec vitest run',
    )
  })

  it('blocks vp -F run test', () => {
    const result = validateForbiddenCommands(bashInput('vp -F @repo/platform-web run test'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp -F @repo/platform-web run test')
  })

  it('blocks vp -C run test', () => {
    const result = validateForbiddenCommands(
      bashInput('vp -C apps/platform/web/platform-web run test'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe(
      'vp -C apps/platform/web/platform-web run test',
    )
  })

  it('blocks vp --filter run lint --fix', () => {
    const result = validateForbiddenCommands(
      bashInput('vp --filter @repo/platform-web run lint --fix'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe(
      'vp --filter @repo/platform-web run lint --fix',
    )
    expect('command' in result && result.suggestion).toContain('--fix')
  })

  it('blocks vp --workspace-root run typecheck', () => {
    const result = validateForbiddenCommands(bashInput('vp --workspace-root run typecheck'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp --workspace-root run typecheck')
  })

  it('blocks vp --dir run lint --fix', () => {
    const result = validateForbiddenCommands(
      bashInput('vp --dir apps/platform/web/platform-web run lint --fix'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe(
      'vp --dir apps/platform/web/platform-web run lint --fix',
    )
    expect('command' in result && result.suggestion).toContain('--fix')
  })

  it('keeps the recorded redirect fixtures in MCP-shaped format', () => {
    for (const fixture of ['ingest-lens.txt', 'monorepo.txt', 'runtime.txt']) {
      const text = readFileSync(
        join(import.meta.dirname, '__fixtures__', 'redirect-format', fixture),
        'utf8',
      ).trim()

      expect(text.startsWith('"vp run test" denied — use wp MCP tool:')).toBe(true)
      expect(text).toContain('wp_test')
      expect(text).toContain('Fallback if MCP unavailable:')
    }
  })

  it('uses mcp config overrides when present in repo config', async () => {
    const { mkdirSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')

    const dir = join(
      tmpdir(),
      `ak-forbidden-commands-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    const sentinelKey = `forbidden-commands-test-${Date.now()}`
    const sentinel = join(tmpdir(), `wp-mcp-ready-${sentinelKey}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        mcp: { serverName: 'custom-server', toolPrefix: 'tool_' },
        rules: { overrides: [] },
        scripts: {},
        durablePlanningRoot: '.agent/planning/',
      }),
    )
    writeFileSync(sentinel, String(process.pid))

    const originalProjectDir = process.env.CLAUDE_PROJECT_DIR
    const originalSentinelKey = process.env.WP_MCP_SENTINEL_KEY
    try {
      // Use CLAUDE_PROJECT_DIR instead of process.chdir() — chdir is not
      // supported in vitest worker threads (breaks Stryker perTest coverage).
      process.env.CLAUDE_PROJECT_DIR = dir
      // Pin sentinel key so the readiness check finds the file we approved wrote
      // regardless of the test runner's cwd.
      process.env.WP_MCP_SENTINEL_KEY = sentinelKey
      const sentinelMod = await import('#hooks/shared/mcp-sentinel')
      sentinelMod._resetProjectKeyCache()
      const result = validateForbiddenCommands(bashInput('vp vitest'))
      expect(result.passed).toBe(false)
      expect('message' in result && result.message).toContain('mcp__custom-server__tool_test(...)')
    } finally {
      if (originalProjectDir !== undefined) {
        process.env.CLAUDE_PROJECT_DIR = originalProjectDir
      } else {
        delete process.env.CLAUDE_PROJECT_DIR
      }
      if (originalSentinelKey !== undefined) {
        process.env.WP_MCP_SENTINEL_KEY = originalSentinelKey
      } else {
        delete process.env.WP_MCP_SENTINEL_KEY
      }
      const sentinelMod = await import('#hooks/shared/mcp-sentinel')
      sentinelMod._resetProjectKeyCache()
      rmSync(sentinel, { force: true })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('blocks vp run test', () => {
    const result = validateForbiddenCommands(bashInput('vp run test'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('vp run test')
  })

  it('blocks vp exec tsc', () => {
    const result = validateForbiddenCommands(bashInput('vp exec tsc'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('typecheck')
  })

  it('blocks vp exec drizzle-kit', () => {
    const result = validateForbiddenCommands(bashInput('vp exec drizzle-kit push'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.suggestion).toContain('database MCP/tooling')
  })

  it('blocks vp exec commands', () => {
    const result = validateForbiddenCommands(bashInput('vp exec whatever'))
    expect(result.passed).toBe(false)
  })

  it('blocks DATABASE_URL= prefix commands', () => {
    const result = validateForbiddenCommands(
      bashInput('DATABASE_URL=postgres://... vp exec drizzle-kit push'),
    )
    expect(result.passed).toBe(false)
  })

  it('blocks vp exec oxlint', () => {
    const result = validateForbiddenCommands(bashInput('vp exec oxlint'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('lint')
  })

  it('blocks vp exec oxlint', () => {
    const result = validateForbiddenCommands(bashInput('vp exec oxlint'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('lint')
  })

  it('blocks vp run lint', () => {
    const result = validateForbiddenCommands(bashInput('vp run lint'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('lint')
  })

  it('blocks vp exec stryker', () => {
    const result = validateForbiddenCommands(bashInput('vp exec stryker run'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('test')
  })

  it('blocks vp exec vitest', () => {
    const result = validateForbiddenCommands(bashInput('vp exec vitest run'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('test')
  })

  it('blocks package-runner vitest aliases', () => {
    for (const command of [
      'pnpm exec vitest run',
      'npm exec vitest run',
      'npm exec -- vitest run',
      'npx vitest run',
      'yarn vitest run',
      'yarn exec vitest run',
      'bunx vitest run',
    ]) {
      const result = validateForbiddenCommands(bashInput(command))
      expect(result.passed, command).toBe(false)
      expect('command' in result && result.category, command).toBe('test')
      expect('command' in result && result.suggestion, command).toContain('wp_test')
    }
  })

  it('blocks raw node_modules tool wrappers', () => {
    for (const { command, category, suggestion } of RAW_NODE_MODULE_TOOL_CASES) {
      const result = validateForbiddenCommands(bashInput(command))
      expect(result.passed, command).toBe(false)
      expect('command' in result && result.category, command).toBe(category)
      expect('command' in result && result.suggestion, command).toContain(suggestion)
    }
  })

  it('blocks vp exec drizzle-kit', () => {
    const result = validateForbiddenCommands(bashInput('vp exec drizzle-kit generate'))
    expect(result.passed).toBe(false)
  })

  it('blocks scoped vp run test', () => {
    const result = validateForbiddenCommands(bashInput('vp run test --package mypkg'))
    expect(result.passed).toBe(false)
  })

  it('blocks scoped vp run typecheck', () => {
    const result = validateForbiddenCommands(bashInput('vp run typecheck --package mypkg'))
    expect(result.passed).toBe(false)
  })

  it('blocks scoped vp run lint', () => {
    const result = validateForbiddenCommands(bashInput('vp run lint --package mypkg'))
    expect(result.passed).toBe(false)
  })

  it('blocks vp exec markdownlint-cli2 so markdown-only lint routes through qa guidance', () => {
    const result = validateForbiddenCommands(bashInput('vp exec markdownlint-cli2 README.md'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.suggestion).toContain('wp_qa')
  })

  it('allows unrelated commands', () => {
    const result = validateForbiddenCommands(bashInput('echo hello world'))
    expect(result.passed).toBe(true)
  })

  it('allows GitHub Actions log inspection pipelines with quoted filter alternates', () => {
    const filter = [
      'pn' + 'pm',
      'vi' + 'test',
      'consolidation',
      'Test Files',
      'failed',
      'passed',
      'FAIL',
    ].join('|')
    const command = `gh run view 25787826767 --repo webpresso/webpresso --job 75745460498 --log | rg "${filter}" -n | sed -n '1,120p'`

    const result = validateForbiddenCommands(bashInput(command))

    expect(result.passed).toBe(true)
  })

  it('allows approved db-push', () => {
    const result = validateForbiddenCommands(bashInput('approved db-push'))
    expect(result.passed).toBe(true)
  })

  it('blocks commands chained with && that contain blocked commands', () => {
    const result = validateForbiddenCommands(bashInput('echo done && vp run test'))
    expect(result.passed).toBe(false)
  })

  it('blocks stryker bare command', () => {
    const result = validateForbiddenCommands(bashInput('stryker run'))
    expect(result.passed).toBe(false)
  })

  it('blocks vp exec tsgo', () => {
    const result = validateForbiddenCommands(bashInput('vp exec tsgo'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('typecheck')
  })

  it('blocks vp exec tsc', () => {
    const result = validateForbiddenCommands(bashInput('vp exec tsc --noEmit'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('typecheck')
  })

  it('blocks vp exec markdownlint-cli2', () => {
    const result = validateForbiddenCommands(bashInput('vp exec markdownlint-cli2 README.md'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.suggestion).toContain('wp_qa')
  })

  it('blocks prettier bare command', () => {
    const result = validateForbiddenCommands(bashInput('prettier README.md --write'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('format')
    expect('command' in result && result.suggestion).toContain('wp_format')
  })

  it('blocks vp exec prettier', () => {
    const result = validateForbiddenCommands(bashInput('vp exec prettier README.md --write'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('format')
    expect('command' in result && result.suggestion).toContain('wp_format')
  })

  it('blocks vp run test', () => {
    const result = validateForbiddenCommands(bashInput('vp run test'))
    expect(result.passed).toBe(false)
  })

  it('blocks vp typecheck', () => {
    const result = validateForbiddenCommands(bashInput('vp typecheck'))
    expect(result.passed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Blueprint lifecycle enforcement
// ---------------------------------------------------------------------------
describe('blueprint lifecycle enforcement', () => {
  function bashInput(command: string): ToolInput {
    return { tool_input: { command } }
  }

  it('blocks mv targeting blueprints/planned', () => {
    const result = validateForbiddenCommands(
      bashInput('mv blueprints/draft/my-bp blueprints/planned/my-bp'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('blocks mv targeting blueprints/in-progress', () => {
    const result = validateForbiddenCommands(
      bashInput('mv blueprints/planned/my-bp blueprints/in-progress/my-bp'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('blocks mv targeting blueprints/completed', () => {
    const result = validateForbiddenCommands(
      bashInput('mv blueprints/in-progress/my-bp blueprints/completed/my-bp'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('blocks mv with absolute paths to blueprint lifecycle dirs', () => {
    const result = validateForbiddenCommands(
      bashInput(
        'mv /Users/oz/repos/webpresso/blueprints/draft/foo /Users/oz/repos/webpresso/blueprints/planned/',
      ),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('blocks mkdir creating a blueprint lifecycle dir', () => {
    const result = validateForbiddenCommands(
      bashInput('mkdir -p /Users/oz/repos/webpresso/blueprints/planned'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('blocks chained mkdir && mv targeting blueprint dirs', () => {
    const result = validateForbiddenCommands(
      bashInput('mkdir -p blueprints/planned && mv blueprints/draft/foo blueprints/planned/'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('redirect message points to ak_blueprint MCP tool', () => {
    const rule = findMatchingRule('mv blueprints/draft/foo blueprints/planned/')!
    expect(rule).toBeDefined()
    const result = createBlockedResult('mv blueprints/draft/foo blueprints/planned/', rule, {
      mcpReady: true,
    })
    expect(result.message).toContain('mcp__webpresso__wp_blueprint(...)')
  })

  it('allows a legal git mv lifecycle transition', () => {
    const result = validateForbiddenCommands(
      bashInput('git mv blueprints/draft/my-bp blueprints/planned/my-bp'),
    )
    expect(result.passed).toBe(true)
  })

  it('blocks an illegal git mv lifecycle transition and names the legal targets', () => {
    const result = validateForbiddenCommands(
      bashInput('git mv blueprints/draft/foo blueprints/completed/foo'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
    expect('message' in result && result.message).toContain('planned, archived')
  })

  it('blocks echo && illegal git mv blueprints/... (git mv as sub-variant)', () => {
    const result = validateForbiddenCommands(
      bashInput('echo info && git mv blueprints/draft/foo blueprints/completed/foo'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('allows git mv that does not touch blueprint lifecycle dirs', () => {
    const result = validateForbiddenCommands(bashInput('git mv src/foo.ts src/bar.ts'))
    expect(result.passed).toBe(true)
  })

  it('allows mv that does not touch blueprint lifecycle dirs', () => {
    const result = validateForbiddenCommands(bashInput('mv src/foo.ts src/bar.ts'))
    expect(result.passed).toBe(true)
  })

  it('allows mkdir for non-blueprint dirs', () => {
    const result = validateForbiddenCommands(bashInput('mkdir -p src/new-module'))
    expect(result.passed).toBe(true)
  })

  it('does not block git commit whose message body contains blueprint lifecycle paths', () => {
    // The heredoc body is inside $(...) so splitTopLevelCommands keeps depth > 0
    // throughout and never extracts "mv blueprints/..." as a top-level segment.
    const body = [
      "git commit -m \"$(cat <<'EOF'",
      'feat: block blueprint lifecycle mv',
      '',
      'Prevents `mkdir -p blueprints/planned && mv blueprints/draft/foo blueprints/planned/`',
      'EOF',
      ')"',
    ].join('\n')
    const result = validateForbiddenCommands(bashInput(body))
    expect(result.passed).toBe(true)
  })

  it('does not block git commit with blueprint paths in -m flag value', () => {
    const result = validateForbiddenCommands(
      bashInput(
        'git commit -m "chore: move blueprint from blueprints/draft to blueprints/planned"',
      ),
    )
    expect(result.passed).toBe(true)
  })

  it('blocks other-cmd && mv blueprints/... (mv in sub-variant)', () => {
    // splitTopLevelCommands extracts "mv blueprints/..." as a top-level segment,
    // so the blueprint rule fires even when mv is not the first command.
    const result = validateForbiddenCommands(
      bashInput('echo info && mv blueprints/draft/foo blueprints/planned/foo'),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })
})

// ---------------------------------------------------------------------------
// splitTopLevelCommands
// ---------------------------------------------------------------------------
describe('splitTopLevelCommands', () => {
  it('splits simple && chain', () => {
    expect(splitTopLevelCommands('echo a && echo b')).toStrictEqual(['echo a', 'echo b'])
  })

  it('splits || chain', () => {
    expect(splitTopLevelCommands('cmd1 || cmd2')).toStrictEqual(['cmd1', 'cmd2'])
  })

  it('splits pipe', () => {
    expect(splitTopLevelCommands('vp vitest | grep FAIL')).toStrictEqual(['vp vitest', 'grep FAIL'])
  })

  it('splits semicolon', () => {
    expect(splitTopLevelCommands('ls; echo done')).toStrictEqual(['ls', 'echo done'])
  })

  it('does not split && inside single-quoted string', () => {
    expect(splitTopLevelCommands("echo '&& not split'")).toStrictEqual(["echo '&& not split'"])
  })

  it('does not split && inside $(...) subshell', () => {
    const cmd = 'git commit -m "$(cat <<\'EOF\'\nfoo && bar\nEOF\n)"'
    expect(splitTopLevelCommands(cmd)).toStrictEqual([cmd])
  })

  it('does not split && inside nested $($(...))', () => {
    expect(splitTopLevelCommands('echo $(echo $(cat /dev/null) && true)')).toStrictEqual([
      'echo $(echo $(cat /dev/null) && true)',
    ])
  })

  it('splits && at top level even when command contains a quoted string with &&', () => {
    expect(splitTopLevelCommands("echo 'safe' && mv foo bar")).toStrictEqual([
      "echo 'safe'",
      'mv foo bar',
    ])
  })

  it('returns single-element array for a plain command', () => {
    expect(splitTopLevelCommands('mv blueprints/draft/foo blueprints/planned/foo')).toStrictEqual([
      'mv blueprints/draft/foo blueprints/planned/foo',
    ])
  })

  it('returns empty array for empty string', () => {
    expect(splitTopLevelCommands('')).toStrictEqual([])
  })

  it('does not split && inside double-quoted string (no subshell)', () => {
    // double-quote with && but no $() — still must not split
    expect(splitTopLevelCommands('echo "hello && world"')).toStrictEqual(['echo "hello && world"'])
  })

  it('does not split pipes inside double-quoted search patterns', () => {
    const filter = ['pn' + 'pm', 'vi' + 'test', 'Test Files', 'FAIL'].join('|')
    const command = `gh run view 25787826767 --log | rg "${filter}" -n | sed -n '1,120p'`

    expect(splitTopLevelCommands(command)).toStrictEqual([
      'gh run view 25787826767 --log',
      `rg "${filter}" -n`,
      "sed -n '1,120p'",
    ])
  })

  it('splits && at top level when command follows a double-quoted string', () => {
    expect(
      splitTopLevelCommands('echo "hello && world" && mv blueprints/draft/foo blueprints/planned/'),
    ).toStrictEqual(['echo "hello && world"', 'mv blueprints/draft/foo blueprints/planned/'])
  })

  it('does not split && inside $(...) even without surrounding double-quotes', () => {
    // $() at top level (no wrapping double-quote) — depth tracking still applies
    expect(splitTopLevelCommands('echo $(grep foo bar && true) && echo done')).toStrictEqual([
      'echo $(grep foo bar && true)',
      'echo done',
    ])
  })

  it('does not split heredoc body that appears as raw text inside $(...)', () => {
    // Simulates git commit body where mv blueprints/ appears as plain prose lines,
    // NOT wrapped in backticks — the && is still inside $() so must not split.
    const cmd = [
      "git commit -m \"$(cat <<'EOF'",
      'chore: move blueprint',
      '',
      'blueprints/planned/my-bp && mv blueprints/draft/my-bp blueprints/planned/',
      'EOF',
      ')"',
    ].join('\n')
    expect(splitTopLevelCommands(cmd)).toStrictEqual([cmd])
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('forbidden-commands edge cases', () => {
  it('returns undefined for whitespace-only command', () => {
    expect(findMatchingRule('   ')).toBeUndefined()
    expect(getCommandCategory('   ')).toBe('unknown')
  })

  it('handles commands with leading/trailing whitespace', () => {
    const rule = findMatchingRule('  vp vitest  ')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('wp_test')
  })

  it('does not block approved commands even if they contain blocklisted tool names', () => {
    // "approved vitest" itself isn't a valid approved command, but the prefix "approved " should
    // cause it not to match the bare vitest pattern since it starts with "approved "
    // Actually let's check: the pattern for bare vitest is /^vitest(\s|$)/
    // So "approved vitest" would NOT match it.
    const rule = findMatchingRule('approved vitest')
    expect(rule).toBeUndefined()
    // However "approved " prefix itself doesn't bypass all rules
    // The key question: does "vitest" have a bare runner pattern? Yes.
    // But "approved vitest" starts with "approved " not "vitest", so the bare pattern won't match.
  })

  it('matches vp exec oxlint with --fix flag', () => {
    const rule = findMatchingRule('vp exec oxlint --fix')
    expect(rule).toBeDefined()
  })
})

describe('validateForbiddenCommands — wp audit + guard config routing', () => {
  const originalProjectDir = process.env.CLAUDE_PROJECT_DIR
  afterEach(() => {
    if (originalProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR
    else process.env.CLAUDE_PROJECT_DIR = originalProjectDir
  })

  function bashInput(command: string): ToolInput {
    return { tool_input: { command } }
  }
  function setRepoConfig(guard: unknown): void {
    const dir = mkdtempSync(join(tmpdir(), 'wp-guard-'))
    const config: Record<string, unknown> = { version: '1', installed: { tier3Skills: [] } }
    if (guard !== undefined) config.guard = guard
    writeFileSync(join(dir, '.webpressorc.json'), JSON.stringify(config))
    process.env.CLAUDE_PROJECT_DIR = dir
  }

  it('redirects `wp audit <kind>` to the wp_audit MCP tool', () => {
    setRepoConfig(undefined)
    const result = validateForbiddenCommands(bashInput('wp audit catalog-drift'))
    expect(result.passed).toBe(false)
    expect(String(result.message)).toContain('wp_audit(kind="catalog-drift")')
  })

  it('does not redirect `wp audit <unknown-kind>`', () => {
    setRepoConfig(undefined)
    const result = validateForbiddenCommands(bashInput('wp audit not-a-real-kind'))
    expect(result.passed).toBe(true)
  })

  it('routes a configured guard.scriptRoutes script to its audit kind', () => {
    setRepoConfig({ scriptRoutes: { 'docs:check': 'docs-frontmatter' } })
    const result = validateForbiddenCommands(bashInput('pnpm run docs:check'))
    expect(result.passed).toBe(false)
    expect(String(result.message)).toContain('wp_audit(kind="docs-frontmatter")')
  })

  it('ignores guard.scriptRoutes entries with an unknown audit kind', () => {
    setRepoConfig({ scriptRoutes: { 'docs:check': 'bogus-kind' } })
    const result = validateForbiddenCommands(bashInput('pnpm run docs:check'))
    expect(result.passed).toBe(true)
  })

  it('routes raw pnpm to vp when guard.packageManager is vp-only', () => {
    setRepoConfig({ packageManager: 'vp-only' })
    const result = validateForbiddenCommands(bashInput('pnpm install'))
    expect(result.passed).toBe(false)
    expect(String(result.message)).toContain('vp-only')
  })

  it('does not apply vp-only routing without the config flag', () => {
    setRepoConfig(undefined)
    const result = validateForbiddenCommands(bashInput('pnpm install'))
    expect(result.passed).toBe(true)
  })
})
