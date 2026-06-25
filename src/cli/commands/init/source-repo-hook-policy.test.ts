import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  hookCommandEnvPrefix,
  isAgentKitSourceRepo,
  setupCommandForHookPolicy,
} from '#cli/commands/init/source-repo-hook-policy.js'

const created: string[] = []

function makeRepo(name: string | null, withCli: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'wp-source-repo-'))
  created.push(dir)
  if (name !== null) writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
  if (withCli) {
    mkdirSync(join(dir, 'src', 'cli'), { recursive: true })
    writeFileSync(join(dir, 'src', 'cli', 'cli.ts'), 'export {}')
  }
  return dir
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('isAgentKitSourceRepo', () => {
  it('is true for the agent-kit package with a src/cli/cli.ts entrypoint', () => {
    expect(isAgentKitSourceRepo(makeRepo('@webpresso/agent-kit', true))).toBe(true)
  })

  it('is false when the package name is not @webpresso/agent-kit', () => {
    expect(isAgentKitSourceRepo(makeRepo('some-consumer-app', true))).toBe(false)
  })

  it('is false for a published consumer that lacks the src/cli/cli.ts source entrypoint', () => {
    expect(isAgentKitSourceRepo(makeRepo('@webpresso/agent-kit', false))).toBe(false)
  })

  it('is false when package.json is missing', () => {
    expect(isAgentKitSourceRepo(makeRepo(null, false))).toBe(false)
  })
})

describe('source-repo hook policy derivations', () => {
  it('agrees with the legacy WP_FORCE_SOURCE prefix on the setup command for a source repo', () => {
    const sourceRepo = makeRepo('@webpresso/agent-kit', true)
    // The doctor source-maintenance decision was historically derived from
    // setupCommandForHookPolicy(...).startsWith('WP_FORCE_SOURCE=1 '); pin that
    // the canonical predicate stays consistent with the emitted command prefix.
    expect(isAgentKitSourceRepo(sourceRepo)).toBe(true)
    expect(setupCommandForHookPolicy(sourceRepo).startsWith('WP_FORCE_SOURCE=1 ')).toBe(true)
    expect(hookCommandEnvPrefix(sourceRepo)).toBe('WP_FORCE_SOURCE=1 ')
  })

  it('emits no source-force prefix for a consumer repo', () => {
    const consumer = makeRepo('some-consumer-app', false)
    expect(isAgentKitSourceRepo(consumer)).toBe(false)
    expect(setupCommandForHookPolicy(consumer).startsWith('WP_FORCE_SOURCE=1 ')).toBe(false)
    expect(hookCommandEnvPrefix(consumer)).toBe('')
  })
})
