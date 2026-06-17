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

  it.each(configFiles)(
    '%s stays byte-for-byte aligned with the repo-root preset copy',
    async (fileName) => {
      const repositoryRoot = process.cwd()
      const sourceTarget = await readFile(
        join(repositoryRoot, 'src', 'config', 'tsconfig', fileName),
        'utf8',
      )
      const rootTarget = await readFile(join(repositoryRoot, 'tsconfig', fileName), 'utf8')

      expect(rootTarget).toBe(sourceTarget)
    },
  )

  it('react-library preset owns the React ambient types it requires', async () => {
    const repositoryRoot = process.cwd()
    const target = await readFile(
      join(repositoryRoot, 'src', 'config', 'tsconfig', 'react-library.json'),
    )
    const parsed = JSON.parse(target.toString('utf8')) as {
      compilerOptions?: { types?: string[] }
    }

    expect(parsed.compilerOptions?.types).toEqual(['react', 'react-dom'])
  })

  it('publishes tsconfig preset inheritance through canonical package subpaths only', async () => {
    const repositoryRoot = process.cwd()

    const library = JSON.parse(
      await readFile(join(repositoryRoot, 'src', 'config', 'tsconfig', 'library.json'), 'utf8'),
    ) as { extends?: string }
    const reactLibrary = JSON.parse(
      await readFile(
        join(repositoryRoot, 'src', 'config', 'tsconfig', 'react-library.json'),
        'utf8',
      ),
    ) as { extends?: string }
    const cloudflare = JSON.parse(
      await readFile(join(repositoryRoot, 'src', 'config', 'tsconfig', 'cloudflare.json'), 'utf8'),
    ) as { extends?: string }
    const reactRouter = JSON.parse(
      await readFile(
        join(repositoryRoot, 'src', 'config', 'tsconfig', 'react-router.json'),
        'utf8',
      ),
    ) as { extends?: string }

    expect(library.extends).toBe('@webpresso/agent-config/tsconfig/base.json')
    expect(reactLibrary.extends).toBe('@webpresso/agent-config/tsconfig/library.json')
    expect(cloudflare.extends).toBe('@webpresso/agent-config/tsconfig/base.json')
    expect(reactRouter.extends).toBe('@webpresso/agent-config/tsconfig/react-library.json')
  })
})
