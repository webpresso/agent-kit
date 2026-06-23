import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  auditSupportedAgentClis,
  compareCliIds,
  EXPECTED_CLI_IDS,
  parseDocCliIds,
} from './supported-agent-clis.js'

const CLEAN_DOC = `# Supported Agent CLIs

## Tier 1 — must work perfectly (P0)

| CLI | Provider model | Why Tier 1 |
|---|---|---|
| **Claude Code** (\`claude\`) | Anthropic | native plugin runtime |
| **Codex CLI** (\`codex\`) | OpenAI (configurable) | integrated via \`/codex\` skill |

## Tier 2 — fairly well, best-effort (P1)

| CLI | Provider model | Tier 2 caveats |
|---|---|---|
| **Cursor** (\`cursor\`) | Anthropic/OpenAI via Cursor IDE | hooks emitter schema-tested |
| **OpenCode** (\`opencode\`) | Provider-agnostic | Session totals only (\`-f json\` + \`opencode stats\`) |

## Tier 3 — not supported

Any other agent CLI (Aider, custom tools).
`

function makeRepo(doc: string | null, name = '@webpresso/agent-kit'): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-supported-agent-clis-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name }, null, 2))
  if (doc !== null) {
    const docPath = join(root, 'catalog/agent/rules/supported-agent-clis.md')
    mkdirSync(join(docPath, '..'), { recursive: true })
    writeFileSync(docPath, doc)
  }
  return root
}

describe('parseDocCliIds', () => {
  it('extracts exactly the column-1 identifiers from both tables', () => {
    expect([...parseDocCliIds(CLEAN_DOC)].sort()).toStrictEqual([
      'claude',
      'codex',
      'cursor',
      'opencode',
    ])
  })

  it('still parses when later column headers are renamed', () => {
    // Table detection anchors on column 1 (`| CLI |`); renaming "Provider model"
    // must not drop the table and falsely report the CLIs as missing.
    const renamed = CLEAN_DOC.replace(/\| Provider model \|/g, '| Runtime |')
    expect([...parseDocCliIds(renamed)].sort()).toStrictEqual([
      'claude',
      'codex',
      'cursor',
      'opencode',
    ])
  })

  it('ignores a header-shaped line that has no separator row', () => {
    const decoy = `Prose mentioning a fake row.

| CLI | Provider |
some text, not a table row with (\`ghost\`) in it

${CLEAN_DOC}`
    expect([...parseDocCliIds(decoy)].sort()).toStrictEqual([
      'claude',
      'codex',
      'cursor',
      'opencode',
    ])
  })

  it('does not harvest backtick decoys from non-CLI columns', () => {
    // `-f json` and `opencode stats` live in the caveat column; `/codex` and the
    // Tier-3 prose `Aider` must never appear. Only column-1 ids are returned.
    const ids = parseDocCliIds(CLEAN_DOC)
    expect(ids.has('f')).toBe(false)
    expect(ids.has('json')).toBe(false)
    expect(ids.has('stats')).toBe(false)
    expect(ids.has('aider')).toBe(false)
  })
})

describe('compareCliIds', () => {
  it('passes when the doc set equals the expected set', () => {
    expect(compareCliIds(new Set(EXPECTED_CLI_IDS), EXPECTED_CLI_IDS)).toStrictEqual([])
  })

  it('flags code-has-not-in-doc when the doc is missing a shipped CLI', () => {
    const docIds = new Set(['claude', 'codex', 'opencode']) // cursor dropped
    const violations = compareCliIds(docIds, EXPECTED_CLI_IDS)
    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('code-has-not-in-doc: `cursor`')
  })

  it('flags doc-has-not-in-code when the doc lists an unmodeled CLI', () => {
    const docIds = new Set([...EXPECTED_CLI_IDS, 'aider'])
    const violations = compareCliIds(docIds, EXPECTED_CLI_IDS)
    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('doc-has-not-in-code: `aider`')
  })

  it('reports both directions independently in one pass', () => {
    const docIds = new Set(['claude', 'codex', 'opencode', 'aider']) // cursor missing, aider extra
    const messages = compareCliIds(docIds, EXPECTED_CLI_IDS).map((v) => v.message)
    expect(messages.some((m) => m.includes('code-has-not-in-doc: `cursor`'))).toBe(true)
    expect(messages.some((m) => m.includes('doc-has-not-in-code: `aider`'))).toBe(true)
  })
})

describe('auditSupportedAgentClis', () => {
  let roots: string[] = []

  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
    roots = []
  })

  function repo(doc: string | null, name?: string): string {
    const root = makeRepo(doc, name)
    roots.push(root)
    return root
  }

  it('passes on a clean repo whose doc matches the code', () => {
    const result = auditSupportedAgentClis(repo(CLEAN_DOC))
    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })

  it('fails with a doc dropping cursor (code-has-not-in-doc)', () => {
    const doc = CLEAN_DOC.replace(/\| \*\*Cursor\*\*.*\n/, '')
    const result = auditSupportedAgentClis(repo(doc))
    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContainEqual(
      expect.stringContaining('code-has-not-in-doc: `cursor`'),
    )
  })

  it('fails with a doc adding an unmodeled CLI (doc-has-not-in-code)', () => {
    const doc = CLEAN_DOC.replace(
      '| **OpenCode** (`opencode`) | Provider-agnostic | Session totals only (`-f json` + `opencode stats`) |',
      '| **OpenCode** (`opencode`) | Provider-agnostic | Session totals |\n| **Foo** (`foo`) | Provider | new |',
    )
    const result = auditSupportedAgentClis(repo(doc))
    expect(result.ok).toBe(false)
    expect(result.violations.map((v) => v.message)).toContainEqual(
      expect.stringContaining('doc-has-not-in-code: `foo`'),
    )
  })

  it('flags a missing rule doc as a violation in the agent-kit repo', () => {
    const result = auditSupportedAgentClis(repo(null))
    expect(result.ok).toBe(false)
    expect(result.violations[0].message).toContain('is missing')
  })

  it('is not applicable (passes, checked 0) outside the agent-kit repo', () => {
    const result = auditSupportedAgentClis(repo(null, '@acme/consumer'))
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
  })
})
