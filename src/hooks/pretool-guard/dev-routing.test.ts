import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('routeCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  async function getRoute() {
    const { routeCommand } = await import('./dev-routing.js')
    return routeCommand
  }

  it('vp exec vitest run → deny, guidance mentions wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec vitest run')
    expect(result).not.toBeNull()
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_test')
  })

  it('vp --dir packages/sdk/common exec markdownlint-cli2 README.md → deny and routes to wp_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp --dir packages/sdk/common exec markdownlint-cli2 README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_qa')
  })

  it('vp -C packages/cli/host exec vitest run → deny and routes to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp -C packages/cli/host exec vitest run')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_test')
  })

  it('vp exec vitest run → deny', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec vitest run')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_test')
  })

  it('vitest run → deny', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vitest run')
    expect(result?.action.action).toBe('deny')
  })

  it('vp exec oxlint . → deny, mentions wp_lint', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec oxlint .')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_lint')
  })

  it('pnpm --filter pkg run test → deny and routes to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm --filter @scope/foo run test', 'sess-1')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_test')
  })

  it('vp run --filter=@scope/foo test → deny and routes to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp run --filter=@scope/foo test', 'sess-1')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_test')
  })

  it('pnpm exec vitest → deny and routes to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm exec vitest', 'sess-3')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_test')
  })

  it('pnpm run qa → deny and routes to wp_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm run qa', 'sess-2')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_qa')
  })

  it('pnpm exec prettier README.md --write → deny and routes to wp_format', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm exec prettier README.md --write', 'sess-4')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_format')
  })

  it('vp exec tsc --noEmit → deny, mentions wp_typecheck', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec tsc --noEmit')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_typecheck')
  })

  it('vp exec markdownlint-cli2 README.md → deny, mentions wp_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec markdownlint-cli2 README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_qa')
  })

  it('prettier README.md → deny, mentions wp_format', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('prettier README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_format')
  })

  it('vp exec prettier README.md --write → deny, mentions wp_format', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp exec prettier README.md --write')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_format')
  })

  it('markdownlint-cli2 README.md → deny, mentions wp_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('markdownlint-cli2 README.md')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.guidance).toContain('wp_qa')
  })

  it('wp audit docs-frontmatter → passthrough', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('wp audit docs-frontmatter')
    expect(result?.action.action).toBe('passthrough')
  })

  it('git status → passthrough', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('git status')
    expect(result?.action.action).toBe('passthrough')
  })

  it('empty string → null', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('')
    expect(result).toBeNull()
  })

  it('session-scoped calls also deny repeatedly', async () => {
    const routeCommand = await getRoute()
    const first = routeCommand('vp exec vitest run', 'session-abc')
    const second = routeCommand('vp exec vitest run', 'session-abc')
    expect(first?.action.action).toBe('deny')
    expect(second?.action.action).toBe('deny')
  })

  it('extracts vp test commands embedded inside ctx_execute code', async () => {
    const { extractRoutableCommandsFromToolInput, routeCommand } = await import('./dev-routing.js')
    const commands = extractRoutableCommandsFromToolInput({
      tool_name: 'context-mode.ctx_execute',
      tool_input: {
        language: 'javascript',
        code: "execFileSync('vp',['run','--filter=@webpresso/agent-kit','test','src/audit/gitignore-agent-surfaces.test.ts'])",
      },
    })

    expect(commands).toContain(
      'vp run --filter=@webpresso/agent-kit test src/audit/gitignore-agent-surfaces.test.ts',
    )
    const result = routeCommand(commands[0] ?? '')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.guidance).toContain('wp_test')
    }
  })

  it('extracts routed commands from ctx_batch_execute command entries', async () => {
    const { extractRoutableCommandsFromToolInput, routeCommand } = await import('./dev-routing.js')
    const commands = extractRoutableCommandsFromToolInput({
      tool_name: 'mcp__context_mode__ctx_batch_execute',
      tool_input: {
        commands: [{ label: 'tests', command: 'vp run --filter=@webpresso/agent-kit test' }],
      },
    })

    expect(commands).toEqual(['vp run --filter=@webpresso/agent-kit test'])
    const result = routeCommand(commands[0] ?? '')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.guidance).toContain('wp_test')
    }
  })
})
