import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import sessionCaptureTool from './session-capture.js'
import sessionSnapshotTool from './session-snapshot.js'

const dirs: string[] = []
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ak-mcp-session-snapshot-'))
  dirs.push(dir)
  return { cwd: dir, sessionDbPath: join(dir, 'sessions.sqlite') }
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('wp_session_snapshot', () => {
  it('snapshots typed continuity events from the same store used by capture', async () => {
    const { cwd, sessionDbPath } = fixture()
    await sessionCaptureTool.handler!({
      cwd,
      sessionDbPath,
      sessionId: 'snapshot-session',
      content: 'snapshot continuity proof',
    })

    const result = await sessionSnapshotTool.handler!({
      cwd,
      sessionDbPath,
      sessionId: 'snapshot-session',
    })

    expect(result.structuredContent).toMatchObject({
      eventsIncluded: 1,
      partial: false,
    })
    expect((result.structuredContent as { snapshotId?: string }).snapshotId).toMatch(/^snap_/)
  })
})
