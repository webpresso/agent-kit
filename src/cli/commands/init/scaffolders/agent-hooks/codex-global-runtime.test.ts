import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const cleanups: string[] = []

afterEach(() => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function mkroot(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  cleanups.push(dir)
  return dir
}

describe('global Codex hook runtime contract', () => {
  it('fails for bare commands in a sanitized environment and succeeds for absolute commands', () => {
    const root = mkroot('wp-codex-global-runtime-')
    const binDir = path.join(root, 'bin')
    mkdirSync(binDir, { recursive: true })

    const fakeContextMode = path.join(binDir, 'context-mode')
    const fakeNode = path.join(binDir, 'node')
    const fakeHookScript = path.join(root, 'codex-native-hook.js')

    writeFileSync(fakeContextMode, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    writeFileSync(fakeNode, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    writeFileSync(fakeHookScript, '// fake hook\n', 'utf8')

    const env = { HOME: root, PATH: '/nonexistent' }
    const bareContextMode = spawnSync(
      '/bin/sh',
      ['-c', 'context-mode hook codex posttooluse >/dev/null 2>&1'],
      { env },
    )
    const bareNode = spawnSync('/bin/sh', ['-c', `node "${fakeHookScript}" >/dev/null 2>&1`], {
      env,
    })
    const absContextMode = spawnSync(
      '/bin/sh',
      ['-c', `"${fakeContextMode}" hook codex posttooluse >/dev/null 2>&1`],
      { env },
    )
    const absNode = spawnSync('/bin/sh', ['-c', `"${fakeNode}" "${fakeHookScript}" >/dev/null 2>&1`], {
      env,
    })

    expect(bareContextMode.status).not.toBe(0)
    expect(bareNode.status).not.toBe(0)
    expect(absContextMode.status).toBe(0)
    expect(absNode.status).toBe(0)
  })
})
