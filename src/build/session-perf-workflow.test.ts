import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

function readWorkflow(): string {
  return readFileSync(join(repositoryRoot, '.github', 'workflows', 'session-perf.yml'), 'utf8')
}

function readBenchConfig(): string {
  return readFileSync(join(repositoryRoot, 'vitest.bench.config.ts'), 'utf8')
}

describe('session-perf workflow', () => {
  it('pins setup actions and verifies the vendored ctx-rs delivery surface', () => {
    const workflow = readWorkflow()

    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/u)
    expect(workflow).toMatch(/pnpm\/action-setup@[0-9a-f]{40}/u)
    expect(workflow).toMatch(/actions\/setup-node@[0-9a-f]{40}/u)
    expect(workflow).toMatch(/dtolnay\/rust-toolchain@[0-9a-f]{40}/u)
    expect(workflow).toContain('test -f vendor/ctx-rs/Cargo.toml')
    expect(workflow).toContain('test -f tests/perf/session-capture.bench.ts')
    expect(workflow).not.toContain('AK_SESSION_ENGINE:')
    expect(workflow).not.toContain('WP_DISABLE_CTX')
  })

  it('keeps expensive benchmark execution manual for comparison PRs', () => {
    const workflow = readWorkflow()
    const benchConfig = readBenchConfig()

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'")
    expect(workflow).toContain('vitest.bench.config.ts')
    expect(workflow).toContain('Defer PR benchmark run')
    expect(workflow).toContain('branches: [main]')
    expect(workflow).not.toContain("'feat/ak-session-memory-v2*'")
    expect(benchConfig).toContain("include: ['tests/perf/**/*.bench.ts']")
    expect(benchConfig).not.toContain('globalSetup')
  })
})
