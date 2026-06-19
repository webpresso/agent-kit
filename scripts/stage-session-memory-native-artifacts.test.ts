import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildSessionMemoryNativeStageOperations,
  renderSessionMemoryNativePackageManifest,
  stageSessionMemoryNativeArtifacts,
} from './stage-session-memory-native-artifacts.js'

describe('stage-session-memory-native-artifacts', () => {
  it('maps prebuilt addons into public optional package destinations', () => {
    const [operation] = buildSessionMemoryNativeStageOperations({ rootDir: '/repo' })

    expect(operation).toMatchObject({
      source: '/repo/dist/session-memory-native/darwin-x64/session_memory_napi.node',
      packageAddonDestination:
        '/repo/dist/session-memory-native-packages/agent-kit-session-memory-darwin-x64/session_memory_napi.node',
      packageManifestDestination:
        '/repo/dist/session-memory-native-packages/agent-kit-session-memory-darwin-x64/package.json',
    })
  })

  it('renders npm metadata that exposes only the addon file for the target os/cpu', () => {
    const [operation] = buildSessionMemoryNativeStageOperations({ rootDir: '/repo' })
    const manifest = JSON.parse(
      renderSessionMemoryNativePackageManifest(operation!.target, '1.2.3'),
    )

    expect(manifest).toMatchObject({
      name: '@webpresso/agent-kit-session-memory-darwin-x64',
      version: '1.2.3',
      type: 'commonjs',
      os: ['darwin'],
      cpu: ['x64'],
      main: 'session_memory_napi.node',
      exports: {
        './session_memory_napi.node': './session_memory_napi.node',
      },
      files: ['session_memory_napi.node'],
      publishConfig: {
        registry: 'https://registry.npmjs.org/',
        access: 'public',
      },
    })
  })

  it('copies host artifacts and writes native package manifests', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-session-memory-native-stage-'))

    try {
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '9.8.7' })}\n`,
        'utf8',
      )
      const [operation] = buildSessionMemoryNativeStageOperations({
        rootDir: root,
        selectedTarget: 'host',
      })
      mkdirSync(dirname(operation!.source), { recursive: true })
      writeFileSync(operation!.source, `native:${operation!.target.id}`, 'utf8')

      stageSessionMemoryNativeArtifacts({ rootDir: root, selectedTarget: 'host' })

      expect(readFileSync(operation!.packageAddonDestination, 'utf8')).toBe(
        `native:${operation!.target.id}`,
      )
      expect(existsSync(operation!.packageManifestDestination)).toBe(true)
      expect(JSON.parse(readFileSync(operation!.packageManifestDestination, 'utf8')).version).toBe(
        '9.8.7',
      )
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
