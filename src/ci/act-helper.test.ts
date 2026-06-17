import { describe, expect, it } from 'vitest'

import {
  getCiActSecretProfile,
  injectDefaultActArgs,
  listMissingRequiredSecrets,
  normalizeActSecretsWithOptions,
  pickAllowedSecrets,
  renderSecretsFile,
  resolveCiActSecretProfile,
} from './act-helper.js'

describe('ci act helper', () => {
  it('resolves default profiles from workflow and job', () => {
    expect(resolveCiActSecretProfile({ workflowPath: '.github/workflows/ci.yml' }).id).toBe('none')
    expect(
      resolveCiActSecretProfile({
        workflowPath: '.github/workflows/cleanup-stale-neon-e2e-branches.yml',
        jobName: 'cleanup',
      }).id,
    ).toBe('neon-control-plane')
  })

  it('filters secret maps to allowlist', () => {
    expect(
      pickAllowedSecrets(
        {
          GITHUB_TOKEN: 'g',
          NEON_API_KEY: 'n',
          DOPPLER_TOKEN: 'x',
        },
        getCiActSecretProfile('neon-control-plane').allowedKeys,
      ),
    ).toEqual({
      NEON_API_KEY: 'n',
    })
  })

  it('reports missing required keys', () => {
    expect(
      listMissingRequiredSecrets(
        { NEON_API_KEY: 'n' },
        getCiActSecretProfile('neon-control-plane').requiredKeys,
      ),
    ).toEqual(['NEON_PROJECT_ID', 'NEON_PARENT_BRANCH_ID'])
  })

  it('maps GITHUB_PAT alias when requested', () => {
    expect(
      normalizeActSecretsWithOptions([{ GITHUB_PAT: 'pat' }], {
        mapGithubPatToToken: true,
      }),
    ).toEqual({
      GITHUB_PAT: 'pat',
      GITHUB_TOKEN: 'pat',
    })
  })

  it('renders deterministic secret file payload', () => {
    expect(renderSecretsFile({ BETA: 'two', ALPHA: 'one' })).toBe('ALPHA="one"\nBETA="two"')
  })

  it('injects linux/arm64 default for Apple Silicon', () => {
    expect(injectDefaultActArgs(['-l'], 'darwin', 'arm64')).toEqual([
      '--container-architecture',
      'linux/arm64',
      '-l',
    ])
  })

  it('injects linux/amd64 default for Intel macOS', () => {
    expect(injectDefaultActArgs(['-l'], 'darwin', 'x64')).toEqual([
      '--container-architecture',
      'linux/amd64',
      '-l',
    ])
  })

  it('injects linux/amd64 default for Linux arm64', () => {
    expect(injectDefaultActArgs(['-l'], 'linux', 'arm64')).toEqual([
      '--container-architecture',
      'linux/amd64',
      '-l',
    ])
  })

  it('does not override an explicit container architecture', () => {
    expect(
      injectDefaultActArgs(['--container-architecture', 'linux/amd64', '-l'], 'darwin', 'arm64'),
    ).toEqual(['--container-architecture', 'linux/amd64', '-l'])
  })
})
