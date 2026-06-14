import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT_PATH = 'scripts/check-workflow-action-pins.ts'
const PINNED_CHECKOUT = 'actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd'

function writeWorkflow(root: string, body: string): void {
  const workflowsDir = join(root, '.github', 'workflows')
  mkdirSync(workflowsDir, { recursive: true })
  writeFileSync(join(workflowsDir, 'ci.yml'), body)
}

describe('check-workflow-action-pins', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wp-workflow-pins-'))
  })

  afterEach(() => {
    rmSync(root, { force: true, recursive: true })
  })

  it('fails before bundle smoke when a workflow runs vp through a package-manager wrapper', () => {
    writeWorkflow(
      root,
      `name: CI
on: [push]
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: ${PINNED_CHECKOUT}
      - run: pnpm exec vp install -g ../..
      - run: npm exec -- vp --version
      - run: npx vp install
      - run: pnpm exec -- vp install -g ../..
      - run: npm x --yes -- vp --version
      - run: yarn dlx vp install
      - run: bunx --bun vp --version
      - run: corepack pnpm@10 exec -- vp --version
`,
    )

    expect(() =>
      execFileSync('bun', [SCRIPT_PATH, root], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).toThrow(/Do not invoke vp through a package-manager wrapper/)
  })

  it('allows direct vp commands after a pinned setup-vp action', () => {
    writeWorkflow(
      root,
      `name: CI
on: [push]
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: ${PINNED_CHECKOUT}
      - uses: voidzero-dev/setup-vp@2dec1e33f4ab2c6d5bce1b0c4607961bb1a3f7a1
      - run: vp install -g ../..
`,
    )

    expect(
      execFileSync('bun', [SCRIPT_PATH, root], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).toContain('OK: GitHub workflow actions are pinned')
  })
})
