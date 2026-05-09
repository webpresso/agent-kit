import path from 'node:path'

export type SharedTestType = 'e2e' | 'integration' | 'unit' | 'worker'

export const WORKER_SIGNATURES = [
  'cloudflare:test',
  'wrangler',
  '@cloudflare/vitest-pool-workers',
] as const

export const INTEGRATION_SIGNATURES = [
  '@webpresso/database',
  '@electric-sql/pglite',
  'drizzle-orm',
  'postgres',
  'pg',
  '@neondatabase/serverless',
  'testcontainers',
  'test-containers',
  'docker',
  'startTransaction',
  'supertest',
  'fastify',
  '@fastify/',
  'node:child_process',
  'child_process',
  'node:fs/promises',
  'execa',
  '@webpresso/test-utils/pglite',
] as const

function lineMatchesSignature(importLine: string, signatures: readonly string[]): boolean {
  return signatures.some(
    (sig) => importLine.includes(`from '${sig}'`) || importLine.includes(`from "${sig}"`),
  )
}

function hasSignature(content: string, signatures: readonly string[]): boolean {
  return content
    .split('\n')
    .some(
      (line) => line.trimStart().startsWith('import ') && lineMatchesSignature(line, signatures),
    )
}

export function hasWorkerSignature(content: string): boolean {
  return hasSignature(content, WORKER_SIGNATURES)
}

export function hasIntegrationSignature(content: string): boolean {
  return hasSignature(content, INTEGRATION_SIGNATURES)
}

function isE2EPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  if (
    normalized.includes('/e2e/lib/') ||
    normalized.includes('/e2e/scripts/') ||
    normalized.includes('/e2e/src/')
  ) {
    return false
  }
  return normalized.includes('/e2e/')
}

function isE2E(filePath: string, content: string): boolean {
  if (isE2EPath(filePath)) return true
  const fileName = path.basename(filePath)
  if (
    fileName.endsWith('.e2e.test.ts') ||
    fileName.endsWith('.e2e.test.tsx') ||
    fileName.endsWith('.e2e.ts')
  ) {
    return true
  }
  return /^import .* from ['"]@playwright\/test['"]/m.test(content)
}

function isWorker(filePath: string, content: string): boolean {
  const fileName = path.basename(filePath)
  if (fileName.endsWith('.workers.test.ts') || fileName.endsWith('.workers.test.tsx')) return true
  if (fileName.endsWith('.miniflare.test.ts') || fileName.endsWith('.miniflare.test.tsx'))
    return true
  return hasWorkerSignature(content)
}

function isIntegration(filePath: string, content: string): boolean {
  const fileName = path.basename(filePath)
  if (fileName.endsWith('.integration.test.ts') || fileName.endsWith('.integration.test.tsx')) {
    return true
  }
  return hasIntegrationSignature(content)
}

export function classifyTestFile(filePath: string, content: string): SharedTestType {
  if (isE2E(filePath, content)) return 'e2e'
  if (isWorker(filePath, content)) return 'worker'
  if (isIntegration(filePath, content)) return 'integration'
  return 'unit'
}
