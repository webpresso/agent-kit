import { describe, expect, it } from 'vitest'

import {
  PUBLISH_RUNTIME_MATRIX_ENV,
  classifyReleasePackage,
  isWorkspaceGithubReleasePackage,
  shouldPublishRuntimeMatrix,
} from './release-policy.js'

describe('shouldPublishRuntimeMatrix', () => {
  it('defaults to true when the env is absent', () => {
    expect(shouldPublishRuntimeMatrix({})).toBe(true)
  })

  it('is true when the env is exactly "1"', () => {
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '1' })).toBe(true)
  })

  it('is false only for the explicit opt-out value "0"', () => {
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '0' })).toBe(false)
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: 'true' })).toBe(true)
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '' })).toBe(true)
  })
})

describe('classifyReleasePackage', () => {
  it('classifies the root package separately from helper and workspace packages', () => {
    expect(classifyReleasePackage('@webpresso/agent-kit')).toBe('root')
  })

  it('classifies native runtime helper packages', () => {
    expect(classifyReleasePackage('@webpresso/agent-kit-runtime-linux-x64')).toBe('runtime-helper')
  })

  it('classifies session-memory native helper packages', () => {
    expect(classifyReleasePackage('@webpresso/agent-kit-session-memory-darwin-arm64')).toBe(
      'session-memory-helper',
    )
  })

  it('classifies future agent-kit generated helper families outside workspace GitHub Releases', () => {
    expect(classifyReleasePackage('@webpresso/agent-kit-future-native-helper')).toBe(
      'generated-helper',
    )
    expect(isWorkspaceGithubReleasePackage('@webpresso/agent-kit-future-native-helper')).toBe(false)
  })

  it('treats other non-root workspace packages as GitHub Release packages', () => {
    expect(classifyReleasePackage('@webpresso/agent-config')).toBe('workspace-github-release')
    expect(isWorkspaceGithubReleasePackage('@webpresso/agent-config')).toBe(true)
    expect(isWorkspaceGithubReleasePackage('@webpresso/agent-kit-runtime-linux-x64')).toBe(false)
    expect(isWorkspaceGithubReleasePackage('@webpresso/agent-kit-session-memory-linux-x64')).toBe(
      false,
    )
  })
})
