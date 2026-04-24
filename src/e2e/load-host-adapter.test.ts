import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AGENT_KIT_CONFIG_FILE_NAME } from './config.js'
import {
  AgentKitConfigExportError,
  HostAdapterExportError,
  findAgentKitConfigPath,
  getAgentKitConfigPath,
  loadAgentKitConfigSafe,
  loadHostAdapter,
} from './load-host-adapter.js'

describe('load-host-adapter', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `agent-kit-e2e-loader-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns null when the root config file does not exist', async () => {
    expect(findAgentKitConfigPath(testDir)).toBeNull()
    expect(getAgentKitConfigPath(testDir)).toBe(join(testDir, AGENT_KIT_CONFIG_FILE_NAME))
    await expect(loadAgentKitConfigSafe({ cwd: testDir })).resolves.toBeNull()
    await expect(loadHostAdapter({ cwd: testDir })).resolves.toBeNull()
  })

  it('fails when the root config file does not export agentKitConfig', async () => {
    writeFileSync(
      join(testDir, AGENT_KIT_CONFIG_FILE_NAME),
      'export const wrongName = {}\n',
      'utf8',
    )

    await expect(loadHostAdapter({ cwd: testDir })).rejects.toBeInstanceOf(
      AgentKitConfigExportError,
    )
  })

  it('fails when the configured adapter export cannot be found', async () => {
    writeFileSync(
      join(testDir, AGENT_KIT_CONFIG_FILE_NAME),
      [
        'export const agentKitConfig = {',
        "  e2e: { hostAdapterModule: './adapter.ts' },",
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(join(testDir, 'adapter.ts'), 'export const somethingElse = {}\n', 'utf8')

    await expect(loadHostAdapter({ cwd: testDir })).rejects.toBeInstanceOf(HostAdapterExportError)
  })

  it('loads the explicit host adapter export before fallback names', async () => {
    writeFileSync(
      join(testDir, AGENT_KIT_CONFIG_FILE_NAME),
      [
        'export const agentKitConfig = {',
        "  e2e: { hostAdapterModule: './adapter.ts', hostAdapterExport: 'customAdapter' },",
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(testDir, 'adapter.ts'),
      [
        'export const customAdapter = {',
        "  listSuites: () => [{ id: 'custom', fileMatchers: ['tests/'], batchKey: 'custom', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'custom' ? 'custom' : null,",
        '  normalizeFilePath: (file) => file,',
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'custom' }),",
        '}',
        '',
        'export const webpressoE2eHostAdapter = {',
        "  listSuites: () => [{ id: 'fallback', fileMatchers: ['fallback/'], batchKey: 'fallback', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'fallback' ? 'fallback' : null,",
        '  normalizeFilePath: (file) => file,',
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'fallback' }),",
        '}',
        '',
      ].join('\n'),
      'utf8',
    )

    const loadedAdapter = await loadHostAdapter({ cwd: testDir })

    expect(loadedAdapter?.exportName).toBe('customAdapter')
    expect(loadedAdapter?.adapter.resolveSuiteId('custom')).toBe('custom')
    expect(loadedAdapter?.adapter.normalizeFilePath('tests/example.e2e.ts')).toBe(
      'tests/example.e2e.ts',
    )
    expect(loadedAdapter?.moduleSpecifier).toBe(pathToFileURL(join(testDir, 'adapter.ts')).href)
  })

  it('falls back to webpressoE2eHostAdapter and default exports', async () => {
    writeFileSync(
      join(testDir, AGENT_KIT_CONFIG_FILE_NAME),
      [
        'export const agentKitConfig = {',
        "  e2e: { hostAdapterModule: './adapter.ts' },",
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(testDir, 'adapter.ts'),
      [
        'const adapter = {',
        "  listSuites: () => [{ id: 'fallback', fileMatchers: ['tests/'], batchKey: 'fallback', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'fallback' ? 'fallback' : null,",
        '  normalizeFilePath: (file) => file,',
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'fallback' }),",
        '}',
        '',
        'export default adapter',
        '',
      ].join('\n'),
      'utf8',
    )

    const loadedAdapter = await loadHostAdapter({ cwd: testDir })

    expect(loadedAdapter?.exportName).toBe('default')
    expect(loadedAdapter?.adapter.resolveSuiteId('fallback')).toBe('fallback')
  })
})
