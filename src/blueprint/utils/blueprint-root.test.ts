import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveBlueprintRoot } from './blueprint-root.js'
import { resolveTechDebtRoot } from './tech-debt-root.js'

describe('consumer layout root resolution', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  async function tempRoot(prefix: string): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), prefix))
    tempDirs.push(root)
    return root
  }

  it('defaults fresh generic agent-kit repos to top-level blueprints and tech-debt', async () => {
    const root = await tempRoot('ak-generic-root-')
    writeFileSync(path.join(root, 'package.json'), '{"name":"consumer"}')

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, 'blueprints'))
    expect(resolveTechDebtRoot(root)).toBe(path.join(root, 'tech-debt'))
  })

  it('keeps Webpresso fallback when the legacy sentinel is present', async () => {
    const root = await tempRoot('ak-webpresso-root-')
    mkdirSync(path.join(root, 'webpresso'), { recursive: true })
    writeFileSync(path.join(root, 'webpresso', 'config.yaml'), 'project:\n  name: webpresso\n')
    writeFileSync(path.join(root, 'package.json'), '{"name":"webpresso"}')

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, 'webpresso', 'blueprints'))
    expect(resolveTechDebtRoot(root)).toBe(path.join(root, 'webpresso', 'tech-debt'))
  })

  it('prefers existing generic directories over legacy directories in consumer repos', async () => {
    const root = await tempRoot('ak-existing-generic-root-')
    mkdirSync(path.join(root, 'blueprints'), { recursive: true })
    mkdirSync(path.join(root, 'webpresso', 'blueprints'), { recursive: true })
    mkdirSync(path.join(root, 'tech-debt'), { recursive: true })
    mkdirSync(path.join(root, 'webpresso', 'tech-debt'), { recursive: true })

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, 'blueprints'))
    expect(resolveTechDebtRoot(root)).toBe(path.join(root, 'tech-debt'))
  })
})
