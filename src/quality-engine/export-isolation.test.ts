import { describe, expect, it } from 'vitest'

import * as qualityEngine from '#quality-engine'

describe('webpresso/quality-engine subpath export', () => {
  it('re-exports named symbols from target-resolver', () => {
    expect(qualityEngine).toHaveProperty('findRepoRoot')
    expect(qualityEngine).toHaveProperty('looksLikeFilePath')
    expect(qualityEngine).toHaveProperty('getPackageShortName')
    expect(qualityEngine).toHaveProperty('defaultFs')
  })

  it('re-exports named symbols from command-builder', () => {
    expect(qualityEngine).toHaveProperty('buildLintCommand')
    expect(qualityEngine).toHaveProperty('buildTypecheckCommand')
    expect(qualityEngine).toHaveProperty('buildVitestCommand')
    expect(qualityEngine).toHaveProperty('CORE_CHECKS')
  })

  it('re-exports named symbols from log-paths', () => {
    expect(qualityEngine).toHaveProperty('generateLogPath')
    expect(qualityEngine).toHaveProperty('extractLogContext')
  })

  it('re-exports named symbols from workspace-config', () => {
    expect(qualityEngine).toHaveProperty('extractPackagePath')
    expect(qualityEngine).toHaveProperty('detectProjectRoot')
    expect(qualityEngine).toHaveProperty('PACKAGE_PATTERNS')
  })

  it('re-exports named symbols from test-classification', () => {
    expect(qualityEngine).toHaveProperty('classifyTestFile')
    expect(qualityEngine).toHaveProperty('hasWorkerSignature')
    expect(qualityEngine).toHaveProperty('WORKER_SIGNATURES')
  })

  it('re-exports named symbols from package-import-rules', () => {
    expect(qualityEngine).toHaveProperty('SHARED_FUNCTIONS')
    expect(qualityEngine).toHaveProperty('findDuplicateFunctions')
    expect(qualityEngine).toHaveProperty('createBlockedResult')
  })
})
