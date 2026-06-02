import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDeployPlan } from './run.js'

describe('createDeployPlan', () => {
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `deploy-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('loads a configured deploy adapter and validates its plan', async () => {
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      "export const agentKitConfig = { deploy: { adapterModule: './deploy-adapter.ts' } }\n",
    )
    writeFileSync(
      join(root, 'deploy-adapter.ts'),
      [
        'export const webpressoDeployAdapter = {',
        '  createPlan: (request) => ({',
        '    schemaVersion: 1,',
        '    lane: request.lane,',
        "    provider: 'cloudflare',",
        "    requiredCredentials: request.dryRun ? [] : ['CLOUDFLARE_API_TOKEN'],",
        "    steps: [{ kind: 'managed-tool', id: 'dry-run', tool: 'wrangler', args: ['deploy', '--dry-run'] }],",
        '  }),',
        '}',
        '',
      ].join('\n'),
    )

    await expect(createDeployPlan({ cwd: root, lane: 'prd', dryRun: true })).resolves.toMatchObject(
      {
        schemaVersion: 1,
        lane: 'prd',
        provider: 'cloudflare',
        requiredCredentials: [],
        steps: [{ kind: 'managed-tool', tool: 'wrangler' }],
      },
    )
  })

  it('rejects invalid lanes before invoking the adapter', async () => {
    writeFileSync(
      join(root, 'agent-kit.config.ts'),
      "export const agentKitConfig = { deploy: { adapterModule: './deploy-adapter.ts' } }\n",
    )
    writeFileSync(join(root, 'deploy-adapter.ts'), 'export default { createPlan: () => ({}) }\n')

    await expect(createDeployPlan({ cwd: root, lane: 'preview-pr-1' })).rejects.toThrow(
      'Invalid deploy lane',
    )
  })
})
