import { describe, expect, it } from 'vitest'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runPreviewCommand } from './preview.js'

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'wp-preview-'))
  mkdirSync(join(root, '.webpresso'), { recursive: true })
  writeFileSync(
    join(root, '.webpresso', 'secrets.config.json'),
    JSON.stringify({
      schemaVersion: 1,
      providers: { default: { type: 'doppler', project: 'ingest-lens' } },
      profiles: {
        preview: { provider: 'default', environment: 'stg' },
        production: { provider: 'default', environment: 'prd' },
      },
      sinks: {
        'dev-server': { defaultProfile: 'preview', allowedOps: ['run'] },
        test: { defaultProfile: 'preview', allowedOps: ['run'] },
        e2e: { defaultProfile: 'preview', allowedOps: ['run'] },
        'deploy-wrangler': { defaultProfile: 'production', allowedOps: ['preview', 'deploy'] },
        pulumi: { defaultProfile: 'preview', allowedOps: ['preview', 'up'] },
        act: { defaultProfile: 'preview', allowedOps: ['replay', 'run'] },
        'github-actions-bootstrap': {
          defaultProfile: 'production',
          allowedOps: ['verify', 'apply', 'rotate', 'revoke'],
        },
        'db-branch': { defaultProfile: 'preview', allowedOps: ['create', 'connect', 'cleanup'] },
      },
    }),
  )
  return root
}

describe('wp preview', () => {
  it('prints a preview plan JSON by default', async () => {
    const root = makeRepo()
    const writes: string[] = []
    try {
      const exitCode = await runPreviewCommand(
        { cwd: root, lane: 'preview_main' },
        {
          stdout: { write: (value: string) => (writes.push(value), true) },
          createPlan: async () => ({ steps: [], lane: 'preview_main', mode: 'deploy' } as any),
        },
      )

      expect(exitCode).toBe(0)
      expect(JSON.parse(writes.join(''))).toMatchObject({
        code: 'WP_PREVIEW_PLAN_READY',
        sinkPlan: { environment: 'stg' },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
