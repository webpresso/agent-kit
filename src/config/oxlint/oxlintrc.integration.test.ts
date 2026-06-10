import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

/**
 * End-to-end proof of the Tier-1 shared oxlint config: the generated, shipped
 * `dist/.../oxlintrc.json` works as an external `--config` for a consumer that
 * has NO local oxlint config and NO oxlint dependency. Exercises the real
 * oxlint binary against the real webpresso jsPlugins.
 *
 * Gated on the built artifacts because oxlint loads jsPlugins as compiled `.js`
 * (it cannot load the `.ts` sources) — so this is meaningful only after `build`
 * has generated the json next to the compiled plugins. CI builds before tests;
 * an unbuilt source clone skips rather than false-failing.
 */
const ROOT = process.cwd()
const SHARED_CONFIG = join(ROOT, 'dist/esm/config/oxlint/oxlintrc.json')
const OXLINT_BIN = join(ROOT, 'node_modules/.bin/oxlint')
const BUILT = existsSync(SHARED_CONFIG) && existsSync(OXLINT_BIN)

describe.skipIf(!BUILT)('shared oxlint config (built dist) as external --config', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function makeConsumer(): string {
    const dir = mkdtempSync(join(tmpdir(), 'wp-oxlint-e2e-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, 'dist'), { recursive: true })
    // A real webpresso-imports violation (relative parent import).
    writeFileSync(join(dir, 'src', 'bad.ts'), 'import { x } from "../shared"\nexport const y = x\n')
    // Same violation inside dist/ — must be ignored by the shared ignorePatterns.
    writeFileSync(
      join(dir, 'dist', 'ignored.ts'),
      'import { z } from "../shared"\nexport const w = z\n',
    )
    return dir
  }

  function runOxlint(cwd: string): { status: number | null; out: string } {
    const result = spawnSync(OXLINT_BIN, ['--config', SHARED_CONFIG, '.'], {
      cwd,
      encoding: 'utf8',
    })
    return { status: result.status, out: `${result.stdout}${result.stderr}` }
  }

  it('flags a webpresso jsPlugin rule in consumer source', () => {
    const { out } = runOxlint(makeConsumer())
    expect(out).toContain('webpresso-imports(no-relative-parent-imports)')
    expect(out).toContain('src/bad.ts')
  })

  it('applies ignorePatterns relative to the consumer project, not the config dir', () => {
    const { out } = runOxlint(makeConsumer())
    // dist/ignored.ts contains the same violation but must be skipped.
    expect(out).not.toContain('ignored.ts')
  })

  it('exits non-zero when the consumer has lint errors', () => {
    const { status } = runOxlint(makeConsumer())
    expect(status).not.toBe(0)
  })
})
