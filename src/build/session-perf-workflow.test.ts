import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

function readWorkflow(): string {
  return readFileSync(join(repositoryRoot, '.github', 'workflows', 'session-perf.yml'), 'utf8')
}

describe('session-perf workflow', () => {
  it('pins setup actions and verifies the vendored ctx-rs delivery surface', () => {
    const workflow = readWorkflow()

    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/u)
    expect(workflow).toMatch(/pnpm\/action-setup@[0-9a-f]{40}/u)
    expect(workflow).toMatch(/actions\/setup-node@[0-9a-f]{40}/u)
    expect(workflow).toMatch(/dtolnay\/rust-toolchain@[0-9a-f]{40}/u)
    expect(workflow).toContain('test -f vendor/ctx-rs/Cargo.toml')
    expect(workflow).not.toContain('AK_SESSION_ENGINE:')
    expect(workflow).not.toContain('WP_DISABLE_CTX')
  })
})
