import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const configFiles = [
  'base.json',
  'cloudflare.json',
  'library.json',
  'react-library.json',
  'react-router.json',
] as const

describe('bundled tsconfig JSON files', () => {
  it.each(configFiles)('%s remains bundled and valid JSON', async (fileName) => {
    const repositoryRoot = process.cwd()
    const target = await readFile(join(repositoryRoot, 'src', 'config', 'tsconfig', fileName))

    expect(() => JSON.parse(target.toString('utf8'))).not.toThrow()
  })
})
