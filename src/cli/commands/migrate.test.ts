import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { runMigrateSecretsCommand } from './migrate.js'

describe('wp migrate secrets', () => {
  it('emits deletion and replacement patches for legacy consumer surfaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-migrate-secrets-'))
    mkdirSync(join(root, 'scripts'), { recursive: true })
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        devDependencies: { '@webpresso/agent-kit': '^2.0.0' },
        scripts: {
          'act:e2e': 'bun ./scripts/act-with-webpresso.ts workflow_dispatch -W .github/workflows/e2e.yml',
          dev: 'with-secrets -- vp run dev',
        },
      }),
    )
    writeFileSync(join(root, 'scripts', 'act-with-webpresso.ts'), 'console.log("legacy")')
    writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'secrets: inherit\nenvironment: prod\n')

    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const exitCode = runMigrateSecretsCommand({ cwd: root, json: true })
      expect(exitCode).toBe(0)
      const output = spy.mock.calls.map(([value]) => String(value)).join('')
      expect(JSON.parse(output)).toMatchObject({
        code: 'WP_MIGRATE_SECRETS_PATCH_PLAN',
      })
      expect(output).toContain('Remove consumer dependency on @webpresso/agent-kit')
      expect(output).toContain('Delete legacy local act helper')
    } finally {
      spy.mockRestore()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
