import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import sessionDoctorTool from './session-doctor.js'
import { SessionMemoryStore } from '../../session-memory/store.js'

const dirs: string[] = []
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-session-doctor-'))
  dirs.push(dir)
  return { sessionDbPath: join(dir, 'sessions.sqlite'), indexDbPath: join(dir, 'index.sqlite') }
}
function payload(result: Awaited<ReturnType<typeof sessionDoctorTool.handler>>) {
  return result.structuredContent as {
    passed: boolean
    counts: { warningCount: number; eventCount: number; chunkCount: number }
    warnings: string[]
  }
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_doctor tool', () => {
  it('reports bounded local diagnostics for healthy stores', async () => {
    expect(sessionDoctorTool.name).toBe('wp_session_doctor')
    expect(sessionDoctorTool.annotations?.readOnlyHint).toBe(true)
    const { sessionDbPath, indexDbPath } = fixture()
    const indexStore = new SessionMemoryStore(indexDbPath)
    indexStore.indexChunk({ id: 'chunk-a', source: 'web:a', text: 'doctor chunk' })
    indexStore.close()

    const data = payload(await sessionDoctorTool.handler({ sessionDbPath, indexDbPath }))
    expect(data.passed).toBe(true)
    expect(data.counts).toMatchObject({ chunkCount: 1 })
    expect(data.warnings).toEqual([])
  })

  it('bounds corrupt store diagnostics without hanging', async () => {
    const { sessionDbPath, indexDbPath } = fixture()
    writeFileSync(indexDbPath, 'not sqlite')
    const result = await sessionDoctorTool.handler({ sessionDbPath, indexDbPath })
    const data = payload(result)
    expect(result.isError).toBe(true)
    expect(data.passed).toBe(false)
    expect(data.counts.warningCount).toBeGreaterThan(0)
    expect(JSON.stringify(data)).not.toContain('not sqlite')
  })
})
