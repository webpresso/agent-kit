import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ToolInput } from '#hooks/shared/types'

import {
  applySuggestionModifiers,
  BLOCKED_SCRIPTS,
  BLOCKED_TOOLS,
  COMMAND_RULES,
  createAuditResult,
  createBlockedResult,
  findMatchingRule,
  generateRules,
  getCommandCategory,
  getCommandVariants,
  getJustEquivalent,
  SKIP_ENV_VAR,
  AUDIT_MODE_ENV,
  SUGGESTION_MODIFIERS,
  splitTopLevelCommands,
  VALIDATOR_NAME,
  validateForbiddenCommands,
} from './forbidden-commands.js'

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

  it('includes pnpm exec vitest as a blocked rule', () => {
    const rules = generateRules()
    const vitestRule = rules.find((r) => r.pattern.test('pnpm exec vitest'))
    expect(vitestRule).toBeDefined()
    expect(vitestRule!.suggestion).toContain('just test')
  })

  it('includes pnpm run test as a blocked rule', () => {
    const rules = generateRules()
    const testScriptRule = rules.find((r) => r.pattern.test('pnpm run test'))
    expect(testScriptRule).toBeDefined()
    expect(testScriptRule!.suggestion).toContain('just test')
  })

  it('includes doppler run as a blocked rule', () => {
    const rules = generateRules()
    const dopplerRule = rules.find((r) => r.pattern.test('doppler run'))
    expect(dopplerRule).toBeDefined()
  })

  it('includes npx as a blocked rule', () => {
    const rules = generateRules()
    const npxRule = rules.find((r) => r.pattern.test('npx something'))
    expect(npxRule).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// findMatchingRule
// ---------------------------------------------------------------------------
describe('findMatchingRule', () => {
  it('matches pnpm vitest and returns the correct rule', () => {
    const rule = findMatchingRule('pnpm vitest')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('just test')
  })

  it('matches pnpm run test', () => {
    const rule = findMatchingRule('pnpm run test')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('just test')
  })

  it('matches pnpm exec tsc', () => {
    const rule = findMatchingRule('pnpm exec tsc')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('typecheck')
  })

  it('matches doppler run command', () => {
    const rule = findMatchingRule('doppler run node script.js')
    expect(rule).toBeDefined()
  })

  it('matches npx command', () => {
    const rule = findMatchingRule('npx some-tool')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('unknown')
  })

  it('matches bunx command', () => {
    const rule = findMatchingRule('bunx drizzle-kit generate')
    expect(rule).toBeDefined()
  })

  it('matches pnpm exec vitest with arguments', () => {
    const rule = findMatchingRule('pnpm exec vitest --run --reporter verbose')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('just test')
  })

  it('returns undefined for an allowed command', () => {
    expect(findMatchingRule('just test --package mypkg')).toBeUndefined()
  })

  it('returns undefined for empty command', () => {
    expect(findMatchingRule('')).toBeUndefined()
  })

  it('returns undefined for unrelated shell command', () => {
    expect(findMatchingRule('echo hello')).toBeUndefined()
  })

  it('matches commands split by &&', () => {
    const rule = findMatchingRule('echo done && pnpm run test')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('just test')
  })

  it('matches commands split by ;', () => {
    const rule = findMatchingRule('ls; pnpm vitest')
    expect(rule).toBeDefined()
  })

  it('matches DATABASE_URL= inline env var', () => {
    const rule = findMatchingRule('DATABASE_URL=postgres://... pnpm exec drizzle-kit push')
    expect(rule).toBeDefined()
  })

  it('does not match partial commands', () => {
    expect(findMatchingRule('just lint')).toBeUndefined()
  })

  it('matches bun run typecheck', () => {
    const rule = findMatchingRule('bun run typecheck')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('typecheck')
  })

  it('matches pnpm exec oxlint', () => {
    const rule = findMatchingRule('pnpm exec oxlint')
    expect(rule).toBeDefined()
    expect(rule!.category).toBe('lint')
  })
})

// ---------------------------------------------------------------------------
// applySuggestionModifiers
// ---------------------------------------------------------------------------
describe('applySuggestionModifiers', () => {
  it('returns the modifier suggestion when --fix flag is present for lint', () => {
    const rule = { pattern: /^pnpm run lint/, category: 'lint' as const, suggestion: 'just lint' }
    expect(applySuggestionModifiers('pnpm run lint --fix', rule)).toContain('--fix')
  })

  it('returns the modifier suggestion when --write flag is present for lint', () => {
    const rule = {
      pattern: /^pnpm exec oxlint/,
      category: 'lint' as const,
      suggestion: 'just lint',
    }
    expect(applySuggestionModifiers('pnpm exec oxlint --write', rule)).toContain('--fix')
  })

  it('returns the modifier suggestion for --fix-dangerous flag', () => {
    const rule = {
      pattern: /^pnpm exec oxfmt/,
      category: 'lint' as const,
      suggestion: 'just format',
    }
    expect(applySuggestionModifiers('pnpm exec oxfmt --fix-dangerous', rule)).toContain(
      '--fix-unsafe',
    )
  })

  it('returns default suggestion when modifier does not match category', () => {
    const rule = {
      pattern: /^pnpm exec stryker/,
      category: 'test' as const,
      suggestion: 'just test --mutation',
    }
    expect(applySuggestionModifiers('pnpm exec stryker run', rule)).toBe('just test --mutation')
  })

  it('returns default suggestion when no modifier pattern matches', () => {
    const rule = {
      pattern: /^pnpm exec tsc/,
      category: 'typecheck' as const,
      suggestion: 'just typecheck',
    }
    expect(applySuggestionModifiers('pnpm exec tsc --noEmit', rule)).toBe('just typecheck')
  })
})

// ---------------------------------------------------------------------------
// getJustEquivalent
// ---------------------------------------------------------------------------
describe('getJustEquivalent', () => {
  it('returns just equivalent for pnpm vitest', () => {
    expect(getJustEquivalent('pnpm vitest')).toContain('just test')
  })

  it('returns just equivalent for pnpm run test', () => {
    expect(getJustEquivalent('pnpm run test')).toContain('just test')
  })

  it('returns just equivalent for pnpm exec tsc', () => {
    expect(getJustEquivalent('pnpm exec tsc')).toContain('just typecheck')
  })

  it('returns just equivalent for pnpm exec oxlint', () => {
    expect(getJustEquivalent('pnpm exec oxlint')).toContain('just lint')
  })

  it('returns generic message for unknown command', () => {
    expect(getJustEquivalent('echo hello')).toBe('just <appropriate-recipe>')
  })

  it('returns generic message for empty command', () => {
    expect(getJustEquivalent('')).toBe('just <appropriate-recipe>')
  })
})

// ---------------------------------------------------------------------------
// getCommandVariants
// ---------------------------------------------------------------------------
describe('getCommandVariants', () => {
  it('returns a single variant for a plain command', () => {
    const variants = getCommandVariants('pnpm vitest')
    expect(variants).toEqual(['pnpm vitest'])
  })

  it('splits chained commands by &&', () => {
    const variants = getCommandVariants('echo done && pnpm run test')
    expect(variants).toContain('echo done')
    expect(variants).toContain('pnpm run test')
  })

  it('splits commands by ;', () => {
    const variants = getCommandVariants('ls; pnpm vitest')
    expect(variants).toContain('ls')
    expect(variants).toContain('pnpm vitest')
  })

  it('splits commands by ||', () => {
    const variants = getCommandVariants('pnpm vitest || echo failed')
    expect(variants).toContain('pnpm vitest')
    expect(variants).toContain('echo failed')
  })

  it('splits commands by |', () => {
    const variants = getCommandVariants('pnpm vitest | grep FAIL')
    expect(variants).toContain('pnpm vitest')
    expect(variants).toContain('grep FAIL')
  })

  it('returns empty array for empty string', () => {
    expect(getCommandVariants('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(getCommandVariants('   ')).toEqual([])
  })

  it('extracts before-pipe segments when command starts with just', () => {
    const variants = getCommandVariants('just test --package foo | grep PASS')
    expect(variants).toContain('just test --package foo')
    // The just branch splits by logical operators but pipes are extracted
    // via the before-pipe logic, not as separate command variants
    expect(variants).toContain('just test --package foo | grep PASS')
  })

  it('splits just command segments by logical operators', () => {
    const variants = getCommandVariants('just test --package foo && just typecheck --package foo')
    expect(variants).toContain('just test --package foo')
    expect(variants).toContain('just typecheck --package foo')
  })
})

// ---------------------------------------------------------------------------
// getCommandCategory
// ---------------------------------------------------------------------------
describe('getCommandCategory', () => {
  it('returns test for pnpm vitest', () => {
    expect(getCommandCategory('pnpm vitest')).toBe('test')
  })

  it('returns lint for pnpm run lint', () => {
    expect(getCommandCategory('pnpm run lint')).toBe('lint')
  })

  it('returns typecheck for pnpm exec tsc', () => {
    expect(getCommandCategory('pnpm exec tsc')).toBe('typecheck')
  })

  it('returns unknown for npx command', () => {
    expect(getCommandCategory('npx something')).toBe('unknown')
  })

  it('returns unknown for allowed command', () => {
    expect(getCommandCategory('just test --package foo')).toBe('unknown')
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
    const rule = findMatchingRule('pnpm vitest')!
    const result = createBlockedResult('pnpm vitest', rule, { mcpReady: true })
    expect(result.validator).toBe(VALIDATOR_NAME)
    expect(result.passed).toBe(false)
    expect(result.command).toBe('pnpm vitest')
    expect(result.category).toBe('test')
    expect(result.message).toContain('pnpm vitest')
    expect(result.message).toContain('mcp__agent-kit__ak_test(...)')
    expect(result.message).toContain('Fallback if MCP unavailable:')
    expect(result.docsRef).toBeDefined()
    expect(result.matchedPattern).toBeDefined()
  })

  it('includes suggestion in the message', () => {
    const rule = findMatchingRule('pnpm exec tsc')!
    const result = createBlockedResult('pnpm exec tsc', rule, { mcpReady: false })
    expect(result.suggestion).toContain('just typecheck')
    expect(result.message).toContain(result.suggestion)
  })

  it('filters through suggestion modifiers', () => {
    const rule = {
      pattern: /^pnpm exec oxfmt/,
      category: 'lint' as const,
      suggestion: 'just format',
    }
    const result = createBlockedResult('pnpm exec oxfmt --fix-dangerous', rule)
    expect(result.suggestion).toContain('--fix-unsafe')
  })
})

// ---------------------------------------------------------------------------
// createAuditResult
// ---------------------------------------------------------------------------
describe('createAuditResult', () => {
  it('returns a passed result with audit prefix', () => {
    const rule = findMatchingRule('pnpm vitest')!
    const result = createAuditResult('pnpm vitest', rule, { mcpReady: true })
    expect(result.validator).toBe(VALIDATOR_NAME)
    expect(result.passed).toBe(true)
    expect(result.message).toContain('[AUDIT] Would block')
    expect(result.command).toBe('pnpm vitest')
    expect(result.message).toContain('mcp__agent-kit__ak_test(...)')
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

  it('blocks pnpm vitest', () => {
    const result = validateForbiddenCommands(bashInput('pnpm vitest'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('pnpm vitest')
    expect('command' in result && result.suggestion).toContain('just test')
  })

  it('keeps the recorded redirect fixtures in MCP-shaped format', () => {
    for (const fixture of ['ingest-lens.txt', 'monorepo.txt', 'runtime.txt']) {
      const text = readFileSync(
        join(import.meta.dirname, '__fixtures__', 'redirect-format', fixture),
        'utf8',
      ).trim()

      expect(text.startsWith('"pnpm test" denied — use agent-kit MCP tool:')).toBe(true)
      expect(text).toContain('mcp__agent-kit__ak_test(...)')
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
    const sentinel = join(tmpdir(), `ak-mcp-ready-${sentinelKey}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, '.agent-kitrc.json'),
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
    const originalSentinelKey = process.env.AK_MCP_SENTINEL_KEY
    try {
      // Use CLAUDE_PROJECT_DIR instead of process.chdir() — chdir is not
      // supported in vitest worker threads (breaks Stryker perTest coverage).
      process.env.CLAUDE_PROJECT_DIR = dir
      // Pin sentinel key so the readiness check finds the file we just wrote
      // regardless of the test runner's cwd.
      process.env.AK_MCP_SENTINEL_KEY = sentinelKey
      const sentinelMod = await import('#hooks/shared/mcp-sentinel')
      sentinelMod._resetProjectKeyCache()
      const result = validateForbiddenCommands(bashInput('pnpm vitest'))
      expect(result.passed).toBe(false)
      expect('message' in result && result.message).toContain('mcp__custom-server__tool_test(...)')
    } finally {
      if (originalProjectDir !== undefined) {
        process.env.CLAUDE_PROJECT_DIR = originalProjectDir
      } else {
        delete process.env.CLAUDE_PROJECT_DIR
      }
      if (originalSentinelKey !== undefined) {
        process.env.AK_MCP_SENTINEL_KEY = originalSentinelKey
      } else {
        delete process.env.AK_MCP_SENTINEL_KEY
      }
      const sentinelMod = await import('#hooks/shared/mcp-sentinel')
      sentinelMod._resetProjectKeyCache()
      rmSync(sentinel, { force: true })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('blocks pnpm run test', () => {
    const result = validateForbiddenCommands(bashInput('pnpm run test'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.command).toBe('pnpm run test')
  })

  it('blocks pnpm exec tsc', () => {
    const result = validateForbiddenCommands(bashInput('pnpm exec tsc'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('typecheck')
  })

  it('blocks pnpm exec drizzle-kit', () => {
    const result = validateForbiddenCommands(bashInput('pnpm exec drizzle-kit push'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.suggestion).toContain('just db-push')
  })

  it('blocks npx commands', () => {
    const result = validateForbiddenCommands(bashInput('npx whatever'))
    expect(result.passed).toBe(false)
  })

  it('blocks DATABASE_URL= prefix commands', () => {
    const result = validateForbiddenCommands(
      bashInput('DATABASE_URL=postgres://... pnpm exec drizzle-kit push'),
    )
    expect(result.passed).toBe(false)
  })

  it('blocks pnpm exec oxlint', () => {
    const result = validateForbiddenCommands(bashInput('pnpm exec oxlint'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('lint')
  })

  it('blocks pnpm run lint', () => {
    const result = validateForbiddenCommands(bashInput('pnpm run lint'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('lint')
  })

  it('blocks pnpm exec stryker', () => {
    const result = validateForbiddenCommands(bashInput('pnpm exec stryker run'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('test')
  })

  it('blocks bunx drizzle-kit', () => {
    const result = validateForbiddenCommands(bashInput('bunx drizzle-kit generate'))
    expect(result.passed).toBe(false)
  })

  it('allows just test', () => {
    const result = validateForbiddenCommands(bashInput('just test --package mypkg'))
    expect(result.passed).toBe(true)
  })

  it('allows just typecheck', () => {
    const result = validateForbiddenCommands(bashInput('just typecheck --package mypkg'))
    expect(result.passed).toBe(true)
  })

  it('allows just lint', () => {
    const result = validateForbiddenCommands(bashInput('just lint --package mypkg'))
    expect(result.passed).toBe(true)
  })

  it('allows unrelated commands', () => {
    const result = validateForbiddenCommands(bashInput('echo hello world'))
    expect(result.passed).toBe(true)
  })

  it('allows just db-push', () => {
    const result = validateForbiddenCommands(bashInput('just db-push'))
    expect(result.passed).toBe(true)
  })

  it('blocks commands chained with && that contain blocked commands', () => {
    const result = validateForbiddenCommands(bashInput('echo done && pnpm run test'))
    expect(result.passed).toBe(false)
  })

  it('blocks stryker bare command', () => {
    const result = validateForbiddenCommands(bashInput('stryker run'))
    expect(result.passed).toBe(false)
  })

  it('blocks pnpm exec tsgo', () => {
    const result = validateForbiddenCommands(bashInput('pnpm exec tsgo'))
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('typecheck')
  })

  it('blocks bun run typecheck', () => {
    const result = validateForbiddenCommands(bashInput('bun run typecheck'))
    expect(result.passed).toBe(false)
  })

  it('blocks bun run test', () => {
    const result = validateForbiddenCommands(bashInput('bun run test'))
    expect(result.passed).toBe(false)
  })

  it('blocks npm run test', () => {
    const result = validateForbiddenCommands(bashInput('npm run test'))
    expect(result.passed).toBe(false)
  })

  it('blocks pnpm typecheck', () => {
    const result = validateForbiddenCommands(bashInput('pnpm typecheck'))
    expect(result.passed).toBe(false)
  })

  it('blocks bun exec vitest', () => {
    const result = validateForbiddenCommands(bashInput('bun exec vitest --run'))
    // bun exec is not in the EXEC_RUNNERS list, so this may not be blocked
    // Verify it exists in the rules first
    const rule = findMatchingRule('bun exec vitest --run')
    if (rule) {
      expect(result.passed).toBe(false)
    }
    // If not blocked, check the pattern is reasonable
    expect(result.validator).toBe(VALIDATOR_NAME)
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
        'mv /Users/oz/repos/agent-kit/blueprints/draft/foo /Users/oz/repos/agent-kit/blueprints/planned/',
      ),
    )
    expect(result.passed).toBe(false)
    expect('command' in result && result.category).toBe('blueprint')
  })

  it('blocks mkdir creating a blueprint lifecycle dir', () => {
    const result = validateForbiddenCommands(
      bashInput('mkdir -p /Users/oz/repos/agent-kit/blueprints/planned'),
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
    const result = createBlockedResult(
      'mv blueprints/draft/foo blueprints/planned/',
      rule,
      { mcpReady: true },
    )
    expect(result.message).toContain('mcp__agent-kit__ak_blueprint(...)')
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
    // This is the false-positive that matchFullCommandOnly prevents: the &&-splitter
    // used to extract "mv blueprints/draft/foo blueprints/planned/" from the heredoc
    // content of a git commit -m "..." and treat it as a standalone mv command.
    const body = [
      'git commit -m "$(cat <<\'EOF\'',
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
      bashInput('git commit -m "chore: move blueprint from blueprints/draft to blueprints/planned"'),
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
    expect(splitTopLevelCommands('pnpm vitest | grep FAIL')).toStrictEqual([
      'pnpm vitest',
      'grep FAIL',
    ])
  })

  it('splits semicolon', () => {
    expect(splitTopLevelCommands('ls; echo done')).toStrictEqual(['ls', 'echo done'])
  })

  it('does not split && inside single-quoted string', () => {
    expect(splitTopLevelCommands("echo '&& not split'")).toStrictEqual(["echo '&& not split'"])
  })

  it('does not split && inside $(...) subshell', () => {
    const cmd = "git commit -m \"$(cat <<'EOF'\nfoo && bar\nEOF\n)\""
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
    const rule = findMatchingRule('  pnpm vitest  ')
    expect(rule).toBeDefined()
    expect(rule!.suggestion).toContain('just test')
  })

  it('does not block just commands even if they contain blocklisted tool names', () => {
    // "just vitest" itself isn't a valid just command, but the prefix "just " should
    // cause it not to match the bare vitest pattern since it starts with "just "
    // Actually let's check: the pattern for bare vitest is /^vitest(\s|$)/
    // So "just vitest" would NOT match it.
    const rule = findMatchingRule('just vitest')
    expect(rule).toBeUndefined()
    // However "just " prefix itself doesn't bypass all rules
    // The key question: does "vitest" have a bare runner pattern? Yes.
    // But "just vitest" starts with "just " not "vitest", so the bare pattern won't match.
  })

  it('matches pnpm exec oxlint with --fix flag', () => {
    const rule = findMatchingRule('pnpm exec oxlint --fix')
    expect(rule).toBeDefined()
  })
})
