import type { BlueprintExecutionBackend, RuntimeStateStatus } from '#index'
import type { DirMaker, FileReader, FileRenamer, FileWriter } from './execution-io.js'

import { describe, expect, it, vi } from 'vitest'

import {
  clearBlueprintExecutionState,
  moveBlueprintDirectory,
  persistBlueprintExecutionArtifacts,
  persistBlueprintExecutionMetadata,
  persistBlueprintProgressBridgeState,
  readBlueprintExecutionArtifactsState,
  readBlueprintExecutionState,
  readBlueprintProgressBridgeState,
  readBlueprintRuntimeSnapshot,
  writeBlueprintRuntimeSnapshot,
} from './execution-io.js'

// ---------------------------------------------------------------------------
// Fake writer / reader helpers
// ---------------------------------------------------------------------------

function makeWriter(): { fn: FileWriter; written: Record<string, string> } {
  const written: Record<string, string> = {}
  const fn: FileWriter = async (p, content) => {
    written[p] = content
  }
  return { fn, written }
}

function makeReader(content: string): FileReader {
  return async () => content
}

function makeDirMaker(): DirMaker {
  return async () => undefined
}

// ---------------------------------------------------------------------------
// Fixture factories.
//
// IMPORTANT: gray-matter caches parsed frontmatter keyed by string identity.
// writeBlueprintExecutionMetadata calls setBlueprintFrontmatterFields which
// mutates that cache entry — so any subsequent matter(sameString) call returns
// the mutated data. Never use a module-level constant as the base for
// writeBlueprintExecutionMetadata; always call makeBaseMarkdown() per-test
// to get a fresh (unique) string instance that has never been through the
// gray-matter cache.
// ---------------------------------------------------------------------------

function makeBaseMarkdown(): string {
  // Constructed via array join so every call produces a distinct string
  // object — bypassing gray-matter's string-keyed parse cache.
  return [
    '---',
    'type: blueprint',
    'status: in-progress',
    'complexity: M',
    '---',
    '',
    '# My Plan',
    '',
    '## Tasks',
    '',
  ].join('\n')
}

// Build markdown with execution metadata by round-tripping through the writer.
// Accepts a fresh base string so the caller controls cache isolation.
async function makeMarkdownWithMeta(base: string = makeBaseMarkdown()): Promise<string> {
  const { fn: writer, written } = makeWriter()
  await persistBlueprintExecutionMetadata(
    '/tmp/plan.md',
    {
      backend: 'omx-team',
      executionId: 'exec-abc',
      status: 'running',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    writer,
    makeReader(base),
  )
  return written['/tmp/plan.md']!
}

// ---------------------------------------------------------------------------
// persistBlueprintExecutionMetadata
// ---------------------------------------------------------------------------

describe('persistBlueprintExecutionMetadata', () => {
  it('calls writer with blueprint path', async () => {
    const { fn: writer, written } = makeWriter()
    await persistBlueprintExecutionMetadata(
      '/project/blueprints/in-progress/plan/_overview.md',
      {
        backend: 'omx-team',
        executionId: 'exec-xyz',
        status: 'running',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      writer,
      makeReader(makeBaseMarkdown()),
    )
    expect(Object.keys(written)).toHaveLength(1)
    expect(Object.keys(written)[0]).toBe('/project/blueprints/in-progress/plan/_overview.md')
  })

  it('written content contains executionId', async () => {
    const { fn: writer, written } = makeWriter()
    await persistBlueprintExecutionMetadata(
      '/project/plan.md',
      {
        backend: 'omx-team',
        executionId: 'exec-xyz',
        status: 'running',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      writer,
      makeReader(makeBaseMarkdown()),
    )
    expect(written['/project/plan.md']).toContain('exec-xyz')
  })

  it('propagates reader error', async () => {
    const reader: FileReader = async () => {
      throw new Error('disk error')
    }
    await expect(
      persistBlueprintExecutionMetadata(
        '/project/plan.md',
        { backend: 'omx-team', executionId: 'x', status: 'running', updatedAt: '' },
        makeWriter().fn,
        reader,
      ),
    ).rejects.toThrow('disk error')
  })

  it('propagates writer error', async () => {
    const writer: FileWriter = async () => {
      throw new Error('write error')
    }
    await expect(
      persistBlueprintExecutionMetadata(
        '/project/plan.md',
        { backend: 'omx-team', executionId: 'x', status: 'running', updatedAt: '' },
        writer,
        makeReader(makeBaseMarkdown()),
      ),
    ).rejects.toThrow('write error')
  })
})

// ---------------------------------------------------------------------------
// readBlueprintExecutionState
// ---------------------------------------------------------------------------

describe('readBlueprintExecutionState', () => {
  it('returns null when no metadata in markdown', async () => {
    const result = await readBlueprintExecutionState(
      '/project/plan.md',
      makeReader(makeBaseMarkdown()),
    )
    expect(result).toBeNull()
  })

  it('returns metadata after round-trip through persistBlueprintExecutionMetadata', async () => {
    const withMeta = await makeMarkdownWithMeta()
    const result = await readBlueprintExecutionState('/project/plan.md', makeReader(withMeta))
    expect(result).not.toBeNull()
    expect(result?.executionId).toBe('exec-abc')
    expect(result?.backend).toBe('omx-team')
    expect(result?.status).toBe('running')
  })
})

// ---------------------------------------------------------------------------
// clearBlueprintExecutionState
// ---------------------------------------------------------------------------

describe('clearBlueprintExecutionState', () => {
  it('calls writer with same path', async () => {
    const { fn: writer, written } = makeWriter()
    const withMeta = await makeMarkdownWithMeta()
    await clearBlueprintExecutionState('/project/plan.md', writer, makeReader(withMeta))
    expect(Object.keys(written)).toContain('/project/plan.md')
  })

  it('clears metadata so subsequent read returns null', async () => {
    const { fn: writer, written } = makeWriter()
    const withMeta = await makeMarkdownWithMeta()
    await clearBlueprintExecutionState('/project/plan.md', writer, makeReader(withMeta))
    const cleared = written['/project/plan.md']!
    // After clearing, reading should return null (no execution metadata)
    const result = await readBlueprintExecutionState('/project/plan.md', makeReader(cleared))
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// persistBlueprintExecutionArtifacts
// ---------------------------------------------------------------------------

describe('persistBlueprintExecutionArtifacts', () => {
  it('calls writer once', async () => {
    const { fn: writer, written } = makeWriter()
    const withMeta = await makeMarkdownWithMeta()
    await persistBlueprintExecutionArtifacts(
      '/project/plan.md',
      { artifacts: ['dist/app.js'], verifications: ['pnpm test'] },
      writer,
      makeReader(withMeta),
    )
    expect(Object.keys(written)).toHaveLength(1)
  })

  it('written content contains artifact path', async () => {
    const { fn: writer, written } = makeWriter()
    const withMeta = await makeMarkdownWithMeta()
    await persistBlueprintExecutionArtifacts(
      '/project/plan.md',
      { artifacts: ['dist/app.js'], verifications: ['pnpm test'] },
      writer,
      makeReader(withMeta),
    )
    expect(written['/project/plan.md']).toContain('dist/app.js')
  })
})

// ---------------------------------------------------------------------------
// readBlueprintExecutionArtifactsState
// ---------------------------------------------------------------------------

describe('readBlueprintExecutionArtifactsState', () => {
  it('returns null when no artifact section present', async () => {
    const result = await readBlueprintExecutionArtifactsState(
      '/project/plan.md',
      makeReader(makeBaseMarkdown()),
    )
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// persistBlueprintProgressBridgeState
// ---------------------------------------------------------------------------

describe('persistBlueprintProgressBridgeState', () => {
  it('calls dirMaker and writer', async () => {
    const { fn: writer, written } = makeWriter()
    const dirMaker = vi.fn<DirMaker>(async () => undefined)
    const bridge = {
      backend: 'omx-team' as BlueprintExecutionBackend,
      executionId: 'exec-abc',
      blueprintSlug: 'in-progress/plan',
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      tasks: [],
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    await persistBlueprintProgressBridgeState('/project', bridge, undefined, writer, dirMaker)

    expect(dirMaker).toHaveBeenCalledOnce()
    expect(Object.keys(written)).toHaveLength(1)
    const writtenPath = Object.keys(written)[0]
    expect(Boolean(writtenPath)).toBe(true)
    expect(writtenPath!).toContain('exec-abc')
  })

  it('written content is valid JSON containing executionId', async () => {
    const { fn: writer, written } = makeWriter()
    const bridge = {
      backend: 'omx-team' as BlueprintExecutionBackend,
      executionId: 'exec-json-test',
      blueprintSlug: 'in-progress/plan',
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      tasks: [],
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    await persistBlueprintProgressBridgeState('/project', bridge, undefined, writer, makeDirMaker())

    const writtenPath = Object.keys(written)[0]!
    const parsed = JSON.parse(written[writtenPath]!)
    expect(parsed.executionId).toBe('exec-json-test')
  })

  it('returns the bridge path', async () => {
    const bridge = {
      backend: 'omx-team' as BlueprintExecutionBackend,
      executionId: 'exec-return',
      blueprintSlug: 'in-progress/plan',
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      tasks: [],
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    const returnedPath = await persistBlueprintProgressBridgeState(
      '/project',
      bridge,
      undefined,
      makeWriter().fn,
      makeDirMaker(),
    )
    expect(returnedPath).toContain('exec-return')
  })
})

// ---------------------------------------------------------------------------
// readBlueprintProgressBridgeState
// ---------------------------------------------------------------------------

describe('readBlueprintProgressBridgeState', () => {
  it('parses bridge JSON from reader', async () => {
    const bridge = {
      backend: 'omx-team' as BlueprintExecutionBackend,
      executionId: 'exec-read',
      blueprintSlug: 'in-progress/plan',
      blueprintPath: 'blueprints/in-progress/plan/_overview.md',
      tasks: [],
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    const result = await readBlueprintProgressBridgeState(
      '/project',
      'omx-team',
      'exec-read',
      undefined,
      makeReader(JSON.stringify(bridge)),
    )
    expect(result.executionId).toBe('exec-read')
  })

  it('propagates reader error', async () => {
    const reader: FileReader = async () => {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    }
    await expect(
      readBlueprintProgressBridgeState('/project', 'omx-team', 'exec-missing', undefined, reader),
    ).rejects.toThrow('not found')
  })
})

// ---------------------------------------------------------------------------
// writeBlueprintRuntimeSnapshot
// ---------------------------------------------------------------------------

describe('writeBlueprintRuntimeSnapshot', () => {
  it('calls dirMaker and writer', async () => {
    const { fn: writer, written } = makeWriter()
    const dirMaker = vi.fn<DirMaker>(async () => undefined)

    await writeBlueprintRuntimeSnapshot(
      '/project',
      {
        backend: 'omx-team',
        executionId: 'snap-abc',
        status: 'running' as RuntimeStateStatus,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      undefined,
      writer,
      dirMaker,
    )

    expect(dirMaker).toHaveBeenCalledOnce()
    const writtenPath = Object.keys(written)[0]!
    expect(writtenPath).toContain('snap-abc')
  })

  it('written content is valid JSON snapshot', async () => {
    const { fn: writer, written } = makeWriter()
    await writeBlueprintRuntimeSnapshot(
      '/project',
      {
        backend: 'omx-team',
        executionId: 'snap-json',
        status: 'running' as RuntimeStateStatus,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      undefined,
      writer,
      makeDirMaker(),
    )
    const writtenPath = Object.keys(written)[0]!
    const parsed = JSON.parse(written[writtenPath]!)
    expect(parsed.executionId).toBe('snap-json')
    expect(parsed.status).toBe('running')
  })

  it('returns snapshot path', async () => {
    const p = await writeBlueprintRuntimeSnapshot(
      '/project',
      {
        backend: 'omx-team',
        executionId: 'snap-ret',
        status: 'running' as RuntimeStateStatus,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      undefined,
      makeWriter().fn,
      makeDirMaker(),
    )
    expect(p).toContain('snap-ret')
  })
})

// ---------------------------------------------------------------------------
// readBlueprintRuntimeSnapshot
// ---------------------------------------------------------------------------

describe('readBlueprintRuntimeSnapshot', () => {
  it('parses snapshot JSON', async () => {
    const snap = {
      backend: 'omx-team',
      executionId: 'snap-parse',
      status: 'running',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    const result = await readBlueprintRuntimeSnapshot(
      '/project',
      'snap-parse',
      undefined,
      makeReader(JSON.stringify(snap)),
    )
    expect(result.executionId).toBe('snap-parse')
    expect(result.status).toBe('running')
  })
})

// ---------------------------------------------------------------------------
// moveBlueprintDirectory
// ---------------------------------------------------------------------------

describe('moveBlueprintDirectory', () => {
  it('calls dirMaker, renamer, and writer in order', async () => {
    const calls: string[] = []
    const writer: FileWriter = async () => {
      calls.push('writer')
    }
    const dirMaker: DirMaker = async () => {
      calls.push('dirMaker')
      return undefined
    }
    const renamer: FileRenamer = async () => {
      calls.push('renamer')
    }

    await moveBlueprintDirectory(
      '/project/blueprints/in-progress/plan',
      '/project/blueprints/completed/plan',
      '/project/blueprints/completed/plan/_overview.md',
      '# content',
      writer,
      dirMaker,
      renamer,
    )

    expect(calls).toEqual(['dirMaker', 'renamer', 'writer'])
  })

  it('writes nextMarkdown to targetPath', async () => {
    const { fn: writer, written } = makeWriter()
    const renamer = vi.fn<FileRenamer>(async () => undefined)

    await moveBlueprintDirectory(
      '/old/dir',
      '/new/dir',
      '/new/dir/_overview.md',
      '# moved content',
      writer,
      makeDirMaker(),
      renamer,
    )

    expect(written['/new/dir/_overview.md']).toBe('# moved content')
  })

  it('propagates renamer error', async () => {
    const renamer: FileRenamer = async () => {
      throw new Error('rename failed')
    }
    await expect(
      moveBlueprintDirectory(
        '/old',
        '/new',
        '/new/_overview.md',
        '',
        makeWriter().fn,
        makeDirMaker(),
        renamer,
      ),
    ).rejects.toThrow('rename failed')
  })
})
