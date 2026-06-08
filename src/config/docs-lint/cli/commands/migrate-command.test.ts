import type { FileSystem, Logger, MigratorDeps, ProcessEnv } from '#config/docs-lint/cli/interfaces'

import { describe, expect, it, vi } from 'vitest'

import { MigrateCommand } from '#config/docs-lint/cli/commands/migrate-command'

/**
 * Atomic-backup fs surface: the shared FileSystem plus the rename + unlink the
 * backup path needs. Tests inject this richer fake; the production adapter
 * supplies the same methods.
 */
type AtomicBackupFs = FileSystem & {
  rename(oldPath: string, newPath: string): Promise<void>
  unlink(path: string): Promise<void>
}

const CWD = '/repo'
const FILE = '/repo/docs/guide.md'
const BACKUP = `${FILE}.bak`

function createLogger(): Logger {
  return {
    info: vi.fn<Logger['info']>(),
    success: vi.fn<Logger['success']>(),
    error: vi.fn<Logger['error']>(),
    warn: vi.fn<Logger['warn']>(),
    debug: vi.fn<Logger['debug']>(),
    log: vi.fn<Logger['log']>(),
  }
}

function createProcess(): ProcessEnv {
  return {
    cwd: vi.fn<ProcessEnv['cwd']>().mockReturnValue(CWD),
    exit: vi.fn<ProcessEnv['exit']>(),
    execSync: vi.fn<ProcessEnv['execSync']>().mockReturnValue(''),
  }
}

/**
 * An in-memory filesystem that simulates atomic-write semantics. `copyFile` and
 * `rename` mutate the store; the destination only becomes visible once a
 * `rename` into it completes. This lets a test observe the on-disk state at the
 * exact moment a mid-write failure occurs.
 */
function createMemoryFs(initial: Record<string, string>): {
  fs: AtomicBackupFs
  store: Map<string, string>
} {
  const store = new Map<string, string>(Object.entries(initial))
  const fs: AtomicBackupFs = {
    readFile: vi.fn(async (path: string) => store.get(path) ?? ''),
    writeFile: vi.fn(async (path: string, content: string) => {
      store.set(path, content)
    }),
    copyFile: vi.fn(async (src: string, dest: string) => {
      store.set(dest, store.get(src) ?? '')
    }),
    existsSync: vi.fn((path: string) => store.has(path)),
    rename: vi.fn(async (oldPath: string, newPath: string) => {
      const value = store.get(oldPath) ?? ''
      store.delete(oldPath)
      store.set(newPath, value)
    }),
    unlink: vi.fn(async (path: string) => {
      store.delete(path)
    }),
  }
  return { fs, store }
}

function makeDeps(fs: AtomicBackupFs): MigratorDeps {
  return {
    fs,
    logger: createLogger(),
    process: createProcess(),
    glob: vi.fn(async () => []),
  }
}

const FRONTMATTERLESS_DOC = '# A doc with no frontmatter\n\nbody\n'

describe('MigrateCommand backup handling', () => {
  it('writes the backup atomically via a temp path then rename', async () => {
    const { fs, store } = createMemoryFs({ [FILE]: FRONTMATTERLESS_DOC })
    const deps = makeDeps(fs)

    const exit = await new MigrateCommand(deps).run({ files: [FILE], backup: true })

    expect(exit).toBe(0)
    // The backup lands and is byte-identical to the original content.
    expect(store.get(BACKUP)).toBe(FRONTMATTERLESS_DOC)
    // It was written through a temp path, not copied directly to .bak.
    const copyDest = vi.mocked(fs.copyFile).mock.calls[0]?.[1]
    expect(copyDest).toMatch(/\.bak\.tmp-/)
    // The temp path was renamed into the final .bak destination.
    expect(fs.rename).toHaveBeenCalledWith(copyDest, BACKUP)
  })

  it('leaves NO partial .bak behind when the copy is interrupted mid-write', async () => {
    // Regression test: against the OLD (non-atomic) code, copyFile wrote
    // directly to `${file}.bak`, so a mid-write crash left a corrupt partial
    // .bak that the existsSync-skip then preserved forever. With the atomic
    // fix, an interrupted copy can only ever touch a temp path, never .bak.
    const { fs, store } = createMemoryFs({ [FILE]: FRONTMATTERLESS_DOC })

    // Simulate copyFile failing AFTER it began writing a partial file to its
    // destination (whatever path that is). The old code's destination was the
    // real .bak; the new code's destination is a temp.
    vi.mocked(fs.copyFile).mockImplementation(async (_src: string, dest: string) => {
      store.set(dest, '# partial-corrupt-conte') // truncated mid-write
      throw new Error('EIO: simulated interruption mid-copy')
    })

    const deps = makeDeps(fs)
    const exit = await new MigrateCommand(deps).run({ files: [FILE], backup: true })

    // The migration reports an error for this file (the copy threw).
    expect(exit).toBe(1)
    // The crucial invariant: the destination .bak is NEVER a partial file.
    // (Under the old code this assertion fails because the partial was written
    // straight to BACKUP and survived.)
    expect(store.has(BACKUP)).toBe(false)
    // No leftover temp files remain either — they were cleaned up in `finally`.
    const leftoverTemps = [...store.keys()].filter((k) => k.includes('.bak.tmp-'))
    expect(leftoverTemps).toStrictEqual([])
  })

  it('skips backup creation when a .bak already exists (preserves the first original)', async () => {
    const EXISTING_BACKUP = '# the true original\n'
    const { fs, store } = createMemoryFs({
      [FILE]: FRONTMATTERLESS_DOC,
      [BACKUP]: EXISTING_BACKUP,
    })
    const deps = makeDeps(fs)

    const exit = await new MigrateCommand(deps).run({ files: [FILE], backup: true })

    expect(exit).toBe(0)
    // The pre-existing backup is untouched — no copy/rename happened.
    expect(store.get(BACKUP)).toBe(EXISTING_BACKUP)
    expect(fs.copyFile).not.toHaveBeenCalled()
    expect(fs.rename).not.toHaveBeenCalled()
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Backup already exists'),
    )
  })

  it('does not create a backup when the --backup option is off', async () => {
    const { fs, store } = createMemoryFs({ [FILE]: FRONTMATTERLESS_DOC })
    const deps = makeDeps(fs)

    const exit = await new MigrateCommand(deps).run({ files: [FILE], backup: false })

    expect(exit).toBe(0)
    expect(store.has(BACKUP)).toBe(false)
    expect(fs.copyFile).not.toHaveBeenCalled()
  })
})
