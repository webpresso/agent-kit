import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildRuntimeStageOperations,
  renderRuntimePackageManifest,
  stageRuntimeArtifacts,
} from './stage-plugin-runtime-artifacts.js'

describe('stage-plugin-runtime-artifacts', () => {
  it('maps compiled artifacts into plugin and runtime-package destinations', () => {
    const operations = buildRuntimeStageOperations({ rootDir: '/repo' })

    expect(operations[0]).toMatchObject({
      source: '/repo/dist/runtime/darwin-arm64/wp',
      pluginDestination: '/repo/bin/runtime/darwin-arm64/wp',
      packageBinaryDestination: '/repo/dist/runtime-packages/agent-kit-runtime-darwin-arm64/bin/wp',
      packageManifestDestination:
        '/repo/dist/runtime-packages/agent-kit-runtime-darwin-arm64/package.json',
    })
  })

  it('renders public npm platform package metadata', () => {
    const [operation] = buildRuntimeStageOperations({ rootDir: '/repo' })
    const manifest = JSON.parse(renderRuntimePackageManifest(operation!.target, '1.2.3'))

    expect(manifest).toMatchObject({
      name: '@webpresso/agent-kit-runtime-darwin-arm64',
      version: '1.2.3',
      repository: {
        type: 'git',
        url: 'https://github.com/webpresso/agent-kit',
      },
      os: ['darwin'],
      cpu: ['arm64'],
      publishConfig: {
        registry: 'https://registry.npmjs.org/',
        access: 'public',
      },
      bin: { wp: 'bin/wp' },
      files: ['bin'],
    })
  })

  it('copies compiled artifacts and writes runtime package manifests', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-runtime-stage-'))

    try {
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '9.8.7' })}\n`,
        'utf8',
      )
      for (const operation of buildRuntimeStageOperations({ rootDir: root })) {
        mkdirSync(dirname(operation.source), { recursive: true })
        writeFileSync(operation.source, `runtime:${operation.target.id}`, 'utf8')
      }

      stageRuntimeArtifacts({ rootDir: root })

      const [operation] = buildRuntimeStageOperations({ rootDir: root })
      expect(readFileSync(operation!.pluginDestination, 'utf8')).toBe('runtime:darwin-arm64')
      expect(readFileSync(operation!.packageBinaryDestination, 'utf8')).toBe('runtime:darwin-arm64')
      expect(existsSync(operation!.packageManifestDestination)).toBe(true)
      expect(JSON.parse(readFileSync(operation!.packageManifestDestination, 'utf8')).version).toBe(
        '9.8.7',
      )
      expect(existsSync(join(root, 'bin', 'wp'))).toBe(false)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
