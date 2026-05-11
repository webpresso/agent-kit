import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getWorkspaceRepos, loadWorkspaceConfig } from './workspace-config.js'

const TMP_DIR = path.join('/tmp', `ak-wc-test-${process.pid}`)

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

function tmpConfig(name = 'workspace.yaml'): string {
  return path.join(TMP_DIR, name)
}

describe('loadWorkspaceConfig', () => {
  it('returns empty config when file is missing', () => {
    const result = loadWorkspaceConfig(tmpConfig('missing.yaml'))
    expect(result).toStrictEqual({ repos: [] })
  })

  it('returns parsed config when file exists with repos', () => {
    const configPath = tmpConfig()
    writeFileSync(
      configPath,
      [
        'repos:',
        '  - path: ~/repos/webpresso/agent-kit',
        '  - path: /absolute/path/to/repo',
      ].join('\n'),
      'utf8',
    )
    const result = loadWorkspaceConfig(configPath)
    expect(result).toStrictEqual({
      repos: [{ path: '~/repos/webpresso/agent-kit' }, { path: '/absolute/path/to/repo' }],
    })
  })

  it('returns empty config when YAML is invalid', () => {
    const configPath = tmpConfig()
    writeFileSync(configPath, '{{ invalid yaml ::::', 'utf8')
    const result = loadWorkspaceConfig(configPath)
    expect(result).toStrictEqual({ repos: [] })
  })

  it('returns empty config when file is empty', () => {
    const configPath = tmpConfig()
    writeFileSync(configPath, '', 'utf8')
    const result = loadWorkspaceConfig(configPath)
    expect(result).toStrictEqual({ repos: [] })
  })

  it('returns empty repos array when repos key is absent', () => {
    const configPath = tmpConfig()
    writeFileSync(configPath, '# no repos key\n', 'utf8')
    const result = loadWorkspaceConfig(configPath)
    expect(result).toStrictEqual({ repos: [] })
  })
})

describe('getWorkspaceRepos', () => {
  it('returns empty array when file is missing', () => {
    const result = getWorkspaceRepos(tmpConfig('missing.yaml'))
    expect(result).toStrictEqual([])
  })

  it('expands ~ to homedir in repo paths', () => {
    const configPath = tmpConfig()
    writeFileSync(
      configPath,
      ['repos:', '  - path: ~/repos/my-project'].join('\n'),
      'utf8',
    )
    const result = getWorkspaceRepos(configPath)
    expect(result).toStrictEqual([path.join(homedir(), 'repos/my-project')])
  })

  it('leaves absolute paths unchanged', () => {
    const configPath = tmpConfig()
    writeFileSync(
      configPath,
      ['repos:', '  - path: /absolute/path/to/repo'].join('\n'),
      'utf8',
    )
    const result = getWorkspaceRepos(configPath)
    expect(result).toStrictEqual(['/absolute/path/to/repo'])
  })

  it('returns multiple expanded paths', () => {
    const configPath = tmpConfig()
    writeFileSync(
      configPath,
      [
        'repos:',
        '  - path: ~/repos/webpresso/agent-kit',
        '  - path: ~/repos/webpresso/monorepo',
        '  - path: /opt/local/repo',
      ].join('\n'),
      'utf8',
    )
    const result = getWorkspaceRepos(configPath)
    expect(result).toStrictEqual([
      path.join(homedir(), 'repos/webpresso/agent-kit'),
      path.join(homedir(), 'repos/webpresso/monorepo'),
      '/opt/local/repo',
    ])
  })
})
