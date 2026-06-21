import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildReplayWorkflowSource,
  createReplayWorkflow,
  GENERATED_REPLAY_WORKFLOW_PLACEHOLDER,
} from './act-replay.js'

describe('ci act replay workflow generation', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('normalizes a workflow to a single replay event and replay name', () => {
    const source = [
      'name: CI',
      'on:',
      '  push:',
      '    branches: [main]',
      '  pull_request:',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo hi',
    ].join('\n')

    const replay = buildReplayWorkflowSource(source, {
      workflowPath: '.github/workflows/ci.yml',
      eventName: 'pull_request',
    })

    expect(replay).toContain('name: "replay: CI"')
    expect(replay).toContain('pull_request:')
    expect(replay).not.toContain('branches: [ main ]')
  })

  it('creates and cleans up a generated replay workflow file', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-act-replay-root-'))
    roots.push(root)
    const workflowPath = join(root, '.github', 'workflows', 'ci.yml')
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    writeFileSync(
      workflowPath,
      ['name: ci', 'on: push', 'jobs:', '  test:', '    runs-on: ubuntu-latest'].join('\n'),
    )

    const replay = createReplayWorkflow({
      cwd: root,
      workflowPath: '.github/workflows/ci.yml',
      eventName: 'pull_request',
    })

    expect(existsSync(replay.workflowPath)).toBe(true)
    expect(replay.workflowPath).not.toContain(GENERATED_REPLAY_WORKFLOW_PLACEHOLDER)
    replay.cleanup()
    expect(existsSync(replay.workflowPath)).toBe(false)
  })
})
