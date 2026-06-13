import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { auditNoDevVars } from './no-dev-vars.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-no-dev-vars-'))
  tempDirs.push(root)
  mkdirSync(join(root, '.webpresso'), { recursive: true })
  writeFileSync(
    join(root, '.webpresso', 'secrets.config.json'),
    JSON.stringify({ manager: 'doppler', projectId: 'my-project' }),
  )
  return root
}

describe('auditNoDevVars', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('skips when secrets.config.json is absent (gate)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-no-dev-vars-gate-'))
    tempDirs.push(root)

    const result = auditNoDevVars(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(0)
    expect(result.violations).toStrictEqual([])
  })

  test('flags .dev.vars on disk', () => {
    const root = tempRepo()
    writeFileSync(join(root, '.dev.vars'), 'API_KEY=secret123')

    const result = auditNoDevVars(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([expect.objectContaining({ file: '.dev.vars' })])
  })

  test('flags .env on disk', () => {
    const root = tempRepo()
    writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://secret')

    const result = auditNoDevVars(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([expect.objectContaining({ file: '.env' })])
  })

  test('passes when no forbidden files are present', () => {
    const root = tempRepo()
    writeFileSync(join(root, 'src.ts'), 'export const x = 1')

    const result = auditNoDevVars(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })

  test('does not flag .env.example', () => {
    const root = tempRepo()
    writeFileSync(join(root, '.env.example'), '# example env vars')

    const result = auditNoDevVars(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toStrictEqual([])
  })
})
