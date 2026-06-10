import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  expectedRootWpBinRelativePath,
  formatRootLauncherContractFailure,
  formatRootLauncherContractSuccess,
  rootContractMode,
  rootWpSelectorSource,
  validateRootLauncherContract,
} from './root-contract.js'

describe('root launcher contract', () => {
  it('exports the shared contract mode and expected root launcher path', () => {
    expect(rootContractMode).toBe('js-selector-runtime-lane')
    expect(expectedRootWpBinRelativePath).toBe('bin/wp')
    expect(formatRootLauncherContractSuccess()).toContain(rootContractMode)
  })

  it('accepts an executable JavaScript selector with a Node shebang', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-root-contract-valid-'))
    const launcherPath = join(root, 'bin', 'wp')

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(launcherPath, rootWpSelectorSource, 'utf8')
      chmodSync(launcherPath, 0o755)

      expect(validateRootLauncherContract(launcherPath)).toMatchObject({ ok: true, code: 'ok' })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('accepts the canonical selector with CRLF line endings', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-root-contract-crlf-'))
    const launcherPath = join(root, 'bin', 'wp')

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(launcherPath, rootWpSelectorSource.replaceAll('\n', '\r\n'), 'utf8')
      chmodSync(launcherPath, 0o755)

      expect(validateRootLauncherContract(launcherPath)).toMatchObject({ ok: true, code: 'ok' })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('rejects native-looking payload bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-root-contract-native-'))
    const launcherPath = join(root, 'bin', 'wp')

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(launcherPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]))
      chmodSync(launcherPath, 0o755)

      const result = validateRootLauncherContract(launcherPath)
      expect(result).toMatchObject({ ok: false, code: 'invalid-selector' })
      expect(formatRootLauncherContractFailure(result)).toContain('Node shebang')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('rejects near-match JavaScript selectors so duplicate launcher logic cannot drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-root-contract-near-match-'))
    const launcherPath = join(root, 'bin', 'wp')

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(
        launcherPath,
        '#!/usr/bin/env node\n\nimport { runNamedBin } from \'./_run.js\'\n\nrunNamedBin("wp")\n',
        'utf8',
      )
      chmodSync(launcherPath, 0o755)

      expect(validateRootLauncherContract(launcherPath)).toMatchObject({
        ok: false,
        code: 'invalid-selector',
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('rejects any symlinked launcher', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-root-contract-symlink-'))
    const launcherPath = join(root, 'bin', 'wp')

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(join(root, 'bin', 'wp.real'), rootWpSelectorSource, 'utf8')
      chmodSync(join(root, 'bin', 'wp.real'), 0o755)
      symlinkSync('wp.real', launcherPath)

      expect(validateRootLauncherContract(launcherPath)).toMatchObject({
        ok: false,
        code: 'symlink',
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('rejects a symlinked bin/runtime target explicitly', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-root-contract-runtime-link-'))
    const launcherPath = join(root, 'bin', 'wp')

    try {
      mkdirSync(join(root, 'bin', 'runtime', 'linux-x64'), { recursive: true })
      writeFileSync(join(root, 'bin', 'runtime', 'linux-x64', 'wp'), 'native runtime\n', 'utf8')
      chmodSync(join(root, 'bin', 'runtime', 'linux-x64', 'wp'), 0o755)
      symlinkSync('runtime/linux-x64/wp', launcherPath)

      const result = validateRootLauncherContract(launcherPath)
      expect(result).toMatchObject({ ok: false, code: 'symlink-runtime-target' })
      expect(formatRootLauncherContractFailure(result)).toContain('bin/runtime/<target>/wp')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
