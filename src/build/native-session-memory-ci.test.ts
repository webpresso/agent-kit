import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

function expectNativeCiGate(workflow: string): void {
  expect(workflow).toContain('Install Rust toolchain for native session-memory checks')
  expect(workflow).toMatch(
    /name: Install Rust toolchain for native session-memory checks\n\s+run: \|\n\s+rustup toolchain install 1\.88\.0 --profile minimal --component rustfmt,clippy\n\s+cargo install cargo-deny --version 0\.19\.9 --locked/u,
  )
  expect(workflow).toContain('pnpm run native:session-memory:fmt')
  expect(workflow).toContain('pnpm run native:session-memory:clippy')
  expect(workflow).toContain('cargo install cargo-deny --version 0.19.9 --locked')
  expect(workflow).toContain('pnpm run native:session-memory:deny')
  expect(workflow).toContain('pnpm run native:session-memory:test')
  expect(workflow).toContain('pnpm run native:session-memory:bench:run')
  expect(workflow).toContain('pnpm run native:session-memory:bench:gate')
  expect(workflow).toContain('WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE: "1"')
}

describe('native session-memory CI warmup', () => {
  it('wires native benchmark compile/run/gate scripts', () => {
    const pkg = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.['native:session-memory:bench']).toContain(
      'native:session-memory:bench:compile',
    )
    expect(pkg.scripts?.['native:session-memory:bench:compile']).toContain('--no-run')
    expect(pkg.scripts?.['native:session-memory:bench:run']).toContain('cargo bench')
    expect(pkg.scripts?.['native:session-memory:bench:run']).not.toContain('--no-run')
    expect(pkg.scripts?.['native:session-memory:bench:gate']).toContain('check-bench-thresholds.sh')
    expect(pkg.scripts?.['native:session-memory:deny']).toBe(
      'cargo deny --manifest-path native/session-memory-engine/Cargo.toml check',
    )
  })

  it('warms the native addon before the public CI parallel test suite', () => {
    const workflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'ci.agent-kit.yml'), 'utf8')

    expect(workflow).toContain('Warm native session-memory addon')
    expect(workflow.indexOf('Warm native session-memory addon')).toBeLessThan(
      workflow.indexOf('- run: pnpm run test'),
    )
    expect(workflow).toContain('loadNativeSessionMemoryEngine')
    expectNativeCiGate(workflow)
  })

  it('warms the native addon before the agent-kit self parallel test suite', () => {
    const workflow = readFileSync(
      join(repositoryRoot, '.github', 'workflows', 'ci.agent-kit.yml'),
      'utf8',
    )

    expect(workflow).toContain('Warm native session-memory addon')
    expect(workflow.indexOf('Warm native session-memory addon')).toBeLessThan(
      workflow.indexOf('- run: pnpm run test'),
    )
    expect(workflow).toContain('loadNativeSessionMemoryEngine')
    expectNativeCiGate(workflow)
  })
})
