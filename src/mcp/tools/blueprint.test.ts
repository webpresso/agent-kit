import { afterEach, describe, expect, it, vi } from 'vitest'

const createBlueprintMock = vi.hoisted(() => vi.fn())
const auditBlueprintsMock = vi.hoisted(() => vi.fn())
const listBlueprintsMock = vi.hoisted(() => vi.fn())
const promoteBlueprintToStateMock = vi.hoisted(() => vi.fn())

vi.mock('#cli/commands/blueprint/router', () => ({
  createBlueprint: createBlueprintMock,
  auditBlueprints: auditBlueprintsMock,
  listBlueprints: listBlueprintsMock,
  promoteBlueprintToState: promoteBlueprintToStateMock,
}))

import akBlueprintTool from './blueprint.js'

function readPayload(result: {
  content: readonly { type: string; text?: string }[]
}): Record<string, unknown> {
  const block = result.content[0]
  if (!block || block.type !== 'text' || typeof block.text !== 'string') {
    throw new Error('Expected MCP text content block')
  }
  return JSON.parse(block.text) as Record<string, unknown>
}

afterEach(() => {
  createBlueprintMock.mockReset()
  auditBlueprintsMock.mockReset()
  listBlueprintsMock.mockReset()
  promoteBlueprintToStateMock.mockReset()
})

describe('ak_blueprint tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(akBlueprintTool.name).toBe('ak_blueprint')
    expect(typeof akBlueprintTool.description).toBe('string')
    expect(akBlueprintTool.handler).toBeTypeOf('function')
  })

  describe('action: new', () => {
    it('invokes createBlueprint with goal + complexity and returns the path', async () => {
      createBlueprintMock.mockResolvedValue({
        path: '/repo/blueprints/draft/my-goal/_overview.md',
        slug: 'my-goal',
        status: 'draft',
        message: 'Created blueprint draft/my-goal.',
      })

      const result = await akBlueprintTool.handler({
        action: 'new',
        goal: 'My goal',
        complexity: 'M',
      })

      expect(createBlueprintMock).toHaveBeenCalledTimes(1)
      const [goalArg, optsArg] = createBlueprintMock.mock.calls[0] as [
        string,
        { complexity: string },
      ]
      expect(goalArg).toBe('My goal')
      expect(optsArg.complexity).toBe('M')

      const payload = readPayload(result)
      expect(payload).toMatchObject({
        action: 'new',
        path: '/repo/blueprints/draft/my-goal/_overview.md',
      })
    })

    it('defaults complexity to M when omitted', async () => {
      createBlueprintMock.mockResolvedValue({
        path: '/repo/blueprints/draft/x/_overview.md',
        slug: 'x',
        status: 'draft',
        message: 'Created blueprint draft/x.',
      })

      await akBlueprintTool.handler({ action: 'new', goal: 'X' })

      const [, optsArg] = createBlueprintMock.mock.calls[0] as [string, { complexity: string }]
      expect(optsArg.complexity).toBe('M')
    })

    it('returns a structured error envelope when createBlueprint throws', async () => {
      createBlueprintMock.mockRejectedValue(new Error('boom'))

      const result = await akBlueprintTool.handler({
        action: 'new',
        goal: 'X',
        complexity: 'M',
      })
      const payload = readPayload(result)
      expect(payload).toMatchObject({ action: 'new', passed: false, error: 'boom' })
    })
  })

  describe('action: audit', () => {
    it('returns {passed: true, errors: []} when audit ok', async () => {
      auditBlueprintsMock.mockResolvedValue({ ok: true, issues: [] })

      const result = await akBlueprintTool.handler({ action: 'audit', all: true })

      expect(auditBlueprintsMock).toHaveBeenCalledTimes(1)
      const [opts] = auditBlueprintsMock.mock.calls[0] as [
        { all?: boolean; strict?: boolean; staged?: boolean },
      ]
      expect(opts.all).toBe(true)

      const payload = readPayload(result)
      expect(payload).toMatchObject({ action: 'audit', passed: true, errors: [] })
    })

    it('returns {passed: false, errors: [...]} for malformed blueprint without throwing', async () => {
      auditBlueprintsMock.mockResolvedValue({
        ok: false,
        issues: [
          { level: 'error', file: 'a/_overview.md', message: 'missing frontmatter' },
          { level: 'warning', file: 'b/_overview.md', message: 'soft warning' },
          { level: 'error', message: 'global issue' },
        ],
      })

      const result = await akBlueprintTool.handler({ action: 'audit' })
      const payload = readPayload(result)
      expect(payload.action).toBe('audit')
      expect(payload.passed).toBe(false)
      expect(Array.isArray(payload.errors)).toBe(true)
      const errors = payload.errors as string[]
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some((e) => e.includes('missing frontmatter'))).toBe(true)
    })

    it('returns a structured error envelope when audit itself throws', async () => {
      auditBlueprintsMock.mockRejectedValue(new Error('audit crashed'))

      const result = await akBlueprintTool.handler({ action: 'audit' })
      const payload = readPayload(result)
      expect(payload).toMatchObject({ action: 'audit', passed: false, error: 'audit crashed' })
    })
  })

  describe('action: list', () => {
    it('invokes listBlueprints and returns structured summaries', async () => {
      listBlueprintsMock.mockResolvedValue([
        {
          name: 'foo',
          title: 'Foo',
          status: 'in-progress',
          complexity: 'M',
          taskCount: 4,
          progress: 2,
        },
        {
          name: 'bar',
          title: 'Bar',
          status: 'draft',
          complexity: 'S',
          taskCount: 3,
          progress: 0,
        },
      ])

      const result = await akBlueprintTool.handler({ action: 'list' })

      expect(listBlueprintsMock).toHaveBeenCalledTimes(1)
      const payload = readPayload(result)
      expect(payload.action).toBe('list')
      const blueprints = payload.blueprints as Array<{
        slug: string
        status: string
        title: string
        progress: number | string
      }>
      expect(blueprints).toHaveLength(2)
      expect(blueprints[0]).toMatchObject({ slug: 'foo', status: 'in-progress', title: 'Foo' })
      expect(blueprints[1]).toMatchObject({ slug: 'bar', status: 'draft', title: 'Bar' })
    })

    it('passes status filter when provided', async () => {
      listBlueprintsMock.mockResolvedValue([])

      await akBlueprintTool.handler({ action: 'list', status: 'completed' })
      const [opts] = listBlueprintsMock.mock.calls[0] as [{ status?: string }]
      expect(opts.status).toBe('completed')
    })

    it('returns a structured error envelope when listBlueprints throws', async () => {
      listBlueprintsMock.mockRejectedValue(new Error('list failed'))

      const result = await akBlueprintTool.handler({ action: 'list' })
      const payload = readPayload(result)
      expect(payload).toMatchObject({ action: 'list', passed: false, error: 'list failed' })
    })
  })

  describe('action: transition', () => {
    it('invokes promoteBlueprintToState with slug + to and returns the lifecycle result', async () => {
      promoteBlueprintToStateMock.mockResolvedValue({
        slug: 'my-blueprint',
        oldState: 'draft',
        newState: 'planned',
        newPath: '/repo/blueprints/planned/my-blueprint/_overview.md',
        message: 'Promoted my-blueprint: draft → planned',
      })

      const result = await akBlueprintTool.handler({
        action: 'transition',
        slug: 'my-blueprint',
        to: 'planned',
      })

      expect(promoteBlueprintToStateMock).toHaveBeenCalledTimes(1)
      const [slugArg, toArg] = promoteBlueprintToStateMock.mock.calls[0] as [string, string]
      expect(slugArg).toBe('my-blueprint')
      expect(toArg).toBe('planned')

      const payload = readPayload(result)
      expect(payload).toMatchObject({
        action: 'transition',
        slug: 'my-blueprint',
        from: 'draft',
        to: 'planned',
        path: '/repo/blueprints/planned/my-blueprint/_overview.md',
      })
    })

    it('rejects missing `slug` with a structured error', async () => {
      const result = await akBlueprintTool.handler({ action: 'transition', to: 'planned' })
      const payload = readPayload(result)
      expect(payload).toMatchObject({ action: 'transition', passed: false })
      expect(promoteBlueprintToStateMock).not.toHaveBeenCalled()
      expect(String(payload.error)).toContain('slug')
    })

    it('rejects missing `to` with a structured error', async () => {
      const result = await akBlueprintTool.handler({
        action: 'transition',
        slug: 'my-blueprint',
      })
      const payload = readPayload(result)
      expect(payload).toMatchObject({ action: 'transition', passed: false })
      expect(promoteBlueprintToStateMock).not.toHaveBeenCalled()
      expect(String(payload.error)).toContain('to')
    })

    it('rejects an invalid `to` value (e.g. "archived" — not a promote target)', async () => {
      const result = await akBlueprintTool.handler({
        action: 'transition',
        slug: 'my-blueprint',
        to: 'archived',
      })
      const payload = readPayload(result)
      expect(payload).toMatchObject({ passed: false })
      expect(promoteBlueprintToStateMock).not.toHaveBeenCalled()
    })

    it('returns a structured error envelope when promoteBlueprintToState throws', async () => {
      promoteBlueprintToStateMock.mockRejectedValue(
        new Error('Cannot promote "x" to completed: tasks open'),
      )

      const result = await akBlueprintTool.handler({
        action: 'transition',
        slug: 'x',
        to: 'completed',
      })
      const payload = readPayload(result)
      expect(payload).toMatchObject({
        action: 'transition',
        passed: false,
        error: 'Cannot promote "x" to completed: tasks open',
      })
    })

    it('routes each valid transition target (planned, in-progress, completed, parked)', async () => {
      promoteBlueprintToStateMock.mockResolvedValue({
        slug: 's',
        oldState: 'draft',
        newState: 'planned',
        newPath: '/p/_overview.md',
        message: 'ok',
      })
      const targets = ['planned', 'in-progress', 'completed', 'parked'] as const
      for (const to of targets) {
        await akBlueprintTool.handler({ action: 'transition', slug: 's', to })
      }
      expect(promoteBlueprintToStateMock).toHaveBeenCalledTimes(targets.length)
      const calledTargets = promoteBlueprintToStateMock.mock.calls.map(
        (call) => (call as [string, string])[1],
      )
      expect(calledTargets).toEqual([...targets])
    })
  })
})
