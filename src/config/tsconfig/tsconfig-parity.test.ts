import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const configFiles = [
  'base.json',
  'cloudflare.json',
  'library.json',
  'react-library.json',
  'react-router.json',
  'webpresso.json',
] as const

describe('bundled tsconfig JSON files', () => {
  it.each(configFiles)('%s matches @webpresso/agent-tsconfig byte-for-byte', async (fileName) => {
    const repositoryRoot = process.cwd()
    const source = await readFile(join(repositoryRoot, 'packages', 'agent-tsconfig', fileName))
    const target = await readFile(join(repositoryRoot, 'src', 'config', 'tsconfig', fileName))

    expect(Buffer.compare(target, source)).toBe(0)
  })
})
