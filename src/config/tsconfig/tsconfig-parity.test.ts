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

  it('react-library preset owns the React ambient types it requires', async () => {
    const repositoryRoot = process.cwd()
    const target = await readFile(join(repositoryRoot, 'src', 'config', 'tsconfig', 'react-library.json'))
    const parsed = JSON.parse(target.toString('utf8')) as {
      compilerOptions?: { types?: string[] }
    }

    expect(parsed.compilerOptions?.types).toEqual(['react', 'react-dom'])
  })
})
