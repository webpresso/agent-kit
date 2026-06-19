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

  it('env-prefixed vitest commands → deny and route to wp_test', async () => {
    const routeCommand = await getRoute()
    for (const command of [
      'WP_SKIP_UPDATE_CHECK=1 vp exec vitest run src/mcp/blueprint-server.test.ts',
      'env WP_SKIP_UPDATE_CHECK=1 vp exec vitest run src/mcp/blueprint-server.test.ts',
    ]) {
      const result = routeCommand(command)
      expect(result?.action.action, command).toBe('deny')
      if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_test')
    }
  })

  it('vitest run → deny', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vitest run')
    expect(result?.action.action).toBe('deny')
  })

  it('bun run test → deny and route to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run test')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_test')
  })

  it('bun run test:slice → deny and route to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run test:slice')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_test')
  })

  it('bun run vitest run → deny and route to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run vitest run src/hooks/pretool-guard/dev-routing.test.ts')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_test')
  })

  it('bun run lint → deny and route to wp_lint', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run lint')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_lint')
  })

  it('bun run typecheck → deny and route to wp_typecheck', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run typecheck')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_typecheck')
  })

  it('bun run e2e → deny and route to wp_e2e', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run e2e')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_e2e')
  })

  it('bun run qa → deny and route to wp_qa', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run qa')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_qa')
  })

  it('denies wrapped wp test invocations and points back to direct wp or MCP', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('vp run wp -- test src/hooks/pretool-guard/dev-routing.test.ts')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.tool).toBe('wp_test')
      expect(result.action.guidance).toContain('Use wp_test MCP tool when available')
      expect(result.action.guidance).toContain('run direct `wp test')
      expect(result.action.guidance).toContain('vp run wp')
    }
  })

  it('denies wrapped wp setup invocations with direct-wp fallback guidance', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('bun run wp setup')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.tool).toBe('wp')
      expect(result.action.guidance).toContain('matching wp_* MCP tool')
      expect(result.action.guidance).toContain('run direct `wp setup`')
      expect(result.action.guidance).toContain('bun run wp')
    }
  })

  it('direct tool paths → deny and route to the matching MCP tool', async () => {
    const routeCommand = await getRoute()

    for (const [command, tool] of [
      ['./../../../../../node_modules/.bin/vitest run src/routes/ci-stack.test.ts', 'wp_test'],
      ['../../../../node_modules/.bin/vitest run src/routes/ci-stack.test.ts', 'wp_test'],
      ['/repo/node_modules/.bin/oxlint .', 'wp_lint'],
      ['.\\node_modules\\.bin\\tsc.cmd --noEmit', 'wp_typecheck'],
      ['./node_modules/.bin/prettier.ps1 README.md --write', 'wp_format'],
      ['../node_modules/.bin/markdownlint-cli2 README.md', 'wp_qa'],
      ['../node_modules/.bin/playwright test e2e/smoke.spec.ts', 'wp_e2e'],
    ] as const) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') expect(result.action.tool).toBe(tool)
    }
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

  it('pnpm run test:slice → deny and route to wp_test', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('pnpm run test:slice', 'sess-1')
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

  it('corepack pnpm --dir exec tsx run-e2e.ts → deny and routes to wp_e2e', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand(
      'corepack pnpm --dir apps/e2e exec tsx src/cli/run-e2e.ts --help',
      'sess-e2e',
    )
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.tool).toBe('wp_e2e')
      expect(result.action.guidance).toContain('wp_e2e')
    }
  })

  it('corepack versioned pnpm and optional exec direct binaries route to MCP tools', async () => {
    const routeCommand = await getRoute()
    for (const [command, tool] of [
      ['corepack pnpm@10 --dir apps/e2e exec playwright test', 'wp_e2e'],
      ['corepack pnpm --dir apps/e2e playwright test', 'wp_e2e'],
      ['pnpm --filter webpresso vitest run src/hooks/pretool-guard/dev-routing.test.ts', 'wp_test'],
      [
        'vp --filter webpresso exec vitest run src/hooks/pretool-guard/dev-routing.test.ts',
        'wp_test',
      ],
    ] as const) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') expect(result.action.tool).toBe(tool)
    }
  })

  it('npm, npx, yarn, and bun package runners route known quality binaries to MCP tools', async () => {
    const routeCommand = await getRoute()
    for (const [command, tool] of [
      ['npm exec -- vitest run src/hooks/pretool-guard/dev-routing.test.ts', 'wp_test'],
      ['npm exec --yes -- vitest run src/hooks/pretool-guard/dev-routing.test.ts', 'wp_test'],
      ['npx vitest run src/hooks/pretool-guard/dev-routing.test.ts', 'wp_test'],
      ['with-secrets -- npx vitest run src/hooks/pretool-guard/dev-routing.test.ts', 'wp_test'],
      ['yarn vitest run src/hooks/pretool-guard/dev-routing.test.ts', 'wp_test'],
      [
        'yarn exec --immutable-cache vitest run src/hooks/pretool-guard/dev-routing.test.ts',
        'wp_test',
      ],
      ['yarn exec playwright test e2e/smoke.spec.ts', 'wp_e2e'],
      ['bunx oxlint .', 'wp_lint'],
      ['bunx --bun oxlint .', 'wp_lint'],
    ] as const) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') expect(result.action.tool).toBe(tool)
    }
  })

  it('denies secret-wrapped wp package-script invocations too', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand(
      'with-secrets -- vp run wp -- test src/hooks/pretool-guard/dev-routing.test.ts',
    )
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.tool).toBe('wp_test')
      expect(result.action.guidance).toContain('run direct `wp test')
    }
  })

  it('npm, npx, yarn, and bunx package runners route known source entrypoints to wp_e2e', async () => {
    const routeCommand = await getRoute()
    for (const command of [
      'npm exec -- tsx src/cli/run-e2e.ts --help',
      'npx tsx src/cli/run-e2e.ts --help',
      'yarn dlx tsx src/cli/run-e2e.ts --help',
      'yarn tsx src/cli/run-e2e.ts --help',
      'bunx tsx src/cli/run-e2e.ts --help',
      'vp dlx tsx src/cli/run-e2e.ts --help',
      'vp node src/cli/run-e2e.ts --help',
    ]) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_e2e')
    }
  })

  it('raw and wrapped CI act source entrypoints deny with secret-aware MCP guidance', async () => {
    const routeCommand = await getRoute()
    for (const command of [
      'bun apps/scripts/src/ci/act.ts --workflow ci-generated-live-validation --execute --chef-url https://chef-ci-alpha.api.webpresso.cloud',
      'bun run apps/scripts/src/ci/act.ts --workflow ci-generated-live-validation --execute',
      'pnpm exec bun apps/scripts/src/ci/act.ts --workflow ci-generated-live-validation',
      'corepack pnpm --dir apps/scripts exec bun apps/scripts/src/ci/act.ts --workflow ci-generated-live-validation',
    ]) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') {
        expect(result.action.tool).toBe('wp_ci_act')
        expect(result.action.guidance).toContain('wp_ci_act')
        expect(result.action.guidance).toContain('wp secrets run --sink act')
        expect(result.action.guidance).not.toMatch(/\bak_/u)
      }
    }
  })

  it('raw and secret-gated act commands deny with wp_ci_act guidance', async () => {
    const routeCommand = await getRoute()
    for (const command of [
      'act -W .github/workflows/ci.yml',
      'with-secrets -- act -W .github/workflows/ci.yml',
      'vp exec act -W .github/workflows/ci.yml',
      'pnpm exec act -W .github/workflows/ci.yml',
    ]) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') {
        expect(result.action.tool).toBe('wp_ci_act')
        expect(result.action.guidance).toContain('wp_ci_act')
        expect(result.action.guidance).toContain('wp secrets run --sink act')
        expect(result.action.guidance).not.toMatch(/\bak_/u)
      }
    }
  })

  it('raw and wrapped wrangler tail commands deny with wp_worker_tail guidance', async () => {
    const routeCommand = await getRoute()
    for (const command of [
      'wrangler tail webpresso-chef-alpha --env preview --status error',
      'with-secrets -- wrangler tail webpresso-chef-alpha --format json',
      'pnpm exec wrangler tail webpresso-chef-alpha',
      'doppler run -- wrangler tail webpresso-chef-alpha --format json',
      '/repo/node_modules/.bin/wrangler tail webpresso-chef-alpha',
    ]) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') {
        expect(result.action.tool).toBe('wp_worker_tail')
        expect(result.action.guidance).toContain('wp_worker_tail')
        expect(result.action.guidance).toContain('wp secrets run --sink deploy-wrangler')
        expect(result.action.guidance).not.toMatch(/\bak_/u)
      }
    }
  })

  it('verification and secret-aware routing guidance names only shipped wp_* MCP tools', async () => {
    const routeCommand = await getRoute()
    for (const [command, expectedTool] of [
      ['vp exec vitest run', 'wp_test'],
      ['vp exec oxlint .', 'wp_lint'],
      ['vp exec tsc --noEmit', 'wp_typecheck'],
      ['vp exec prettier README.md --write', 'wp_format'],
      ['vp exec markdownlint-cli2 README.md', 'wp_qa'],
      ['vp exec playwright test e2e/smoke.spec.ts', 'wp_e2e'],
      ['with-secrets -- wrangler tail webpresso-chef-alpha --format json', 'wp_worker_tail'],
      ['with-secrets -- act -W .github/workflows/ci.yml', 'wp_ci_act'],
    ] as const) {
      const result = routeCommand(command)
      expect(result?.action.action, command).toBe('deny')
      if (result?.action.action === 'deny') {
        expect(result.action.tool, command).toBe(expectedTool)
        expect(result.action.guidance, command).toContain(expectedTool)
        expect(result.action.guidance, command).toContain('MCP tool')
        expect(result.action.guidance, command).not.toMatch(/\bak_/u)
        expect(result.action.guidance, command).not.toMatch(/durable public CLI alias/u)
      }
    }
  })

  it('routes unbounded content-search host tool inputs to concrete wp_session tools', async () => {
    const { routeToolInputToSessionMemory } = await import('./dev-routing.js')
    const result = routeToolInputToSessionMemory({
      tool_name: 'Grep',
      tool_input: { pattern: 'wp_session', path: 'src', output_mode: 'content' },
    })
    expect(result?.action.action).toBe('sandbox')
    if (result?.action.action === 'sandbox') {
      expect(result.action.guidance).toContain('wp_session_batch_execute')
    }
  })

  it('does not sandbox safe small host tool inputs or third-party MCP tools', async () => {
    const { routeToolInputToSessionMemory } = await import('./dev-routing.js')
    for (const [tool_name, tool_input] of [
      ['Read', { file_path: 'src/small.ts', limit: 80 }],
      ['Read', { file_path: 'src/large.ts' }],
      ['Grep', { pattern: 'wp_session', path: 'src', output_mode: 'files_with_matches' }],
      ['Glob', { pattern: '**/*.ts' }],
      ['LS', { path: 'src' }],
      ['WebFetch', { url: 'https://example.com/docs' }],
      ['WebSearch', { query: 'Claude hooks' }],
      ['Task', { prompt: 'inspect a subsystem' }],
      ['mcp__github__get_pull_request', { owner: 'webpresso', repo: 'agent-kit' }],
    ] as const) {
      expect(routeToolInputToSessionMemory({ tool_name, tool_input }), tool_name).toBeNull()
    }
  })

  it('does not sandbox canonical Webpresso wp MCP tools', async () => {
    const { routeToolInputToSessionMemory } = await import('./dev-routing.js')
    for (const tool_name of [
      'mcp__webpresso__wp_test',
      'mcp__webpresso__wp_lint',
      'mcp__webpresso__wp_typecheck',
      'mcp__webpresso__wp_session_search',
    ]) {
      expect(routeToolInputToSessionMemory({ tool_name, tool_input: {} }), tool_name).toBeNull()
    }
  })

  it('does not recurse on raw wp_session tool inputs', async () => {
    const { routeToolInputToSessionMemory } = await import('./dev-routing.js')
    expect(
      routeToolInputToSessionMemory({
        tool_name: 'mcp__webpresso__wp_session_execute_file',
        tool_input: { file_path: 'src/large.ts' },
      }),
    ).toBeNull()
  })

  it('routes raw large-context commands to concrete wp_session tools', async () => {
    const routeCommand = await getRoute()
    for (const [command, tool] of [
      ['cat src/hooks/shared/routing-block.ts', 'wp_session_execute_file'],
      ['grep -R "wp_session" src', 'wp_session_batch_execute'],
      ['find src -name "*.ts"', 'wp_session_batch_execute'],
      ['git log --oneline -50', 'wp_session_batch_execute'],
      ['curl https://example.com/large-doc.md', 'wp_session_fetch_and_index'],
      ['wget https://example.com/large-doc.md', 'wp_session_fetch_and_index'],
    ] as const) {
      const result = routeCommand(command)
      expect(result?.action.action, command).toBe('sandbox')
      if (result?.action.action === 'sandbox') {
        expect(result.action.guidance, command).toContain(tool)
        expect(result.action.guidance, command).not.toMatch(/\bctx_/u)
      }
    }
  })

  it('extracts routable commands only from WP session sandbox MCP tools', async () => {
    const { extractRoutableCommandsFromToolInput } = await import('./dev-routing.js')
    expect(
      extractRoutableCommandsFromToolInput({
        tool_name: 'mcp__webpresso__wp_session_batch_execute',
        tool_input: { commands: [{ command: 'grep -R wp_session src' }] },
      }),
    ).toStrictEqual(['grep -R wp_session src'])
    expect(
      extractRoutableCommandsFromToolInput({
        tool_name: 'ctx_batch_execute',
        tool_input: { commands: [{ command: 'grep -R wp_session src' }] },
      }),
    ).toStrictEqual([])
  })

  it('legacy ak_* tool names are not accepted as routable replacements', async () => {
    const routeCommand = await getRoute()
    for (const command of ['ak_test', 'ak_lint', 'ak_worker_tail', 'ak_ci_act']) {
      expect(routeCommand(command)).toBeNull()
    }
  })

  it('direct tsx run-e2e.ts source execution → deny and routes to wp_e2e', async () => {
    const routeCommand = await getRoute()
    const result = routeCommand('tsx src/cli/run-e2e.ts --help', 'sess-e2e-direct')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') expect(result.action.tool).toBe('wp_e2e')
  })

  it('unmapped tsx scripts are not denied as e2e', async () => {
    const routeCommand = await getRoute()
    for (const command of [
      'pnpm exec tsx scripts/one-off.ts',
      'npx tsx scripts/one-off.ts',
      'yarn dlx tsx scripts/one-off.ts',
      'bun scripts/one-off.ts',
      'bun run scripts/one-off.ts',
    ]) {
      const result = routeCommand(command)
      expect(result).toBeNull()
    }
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

  it('raw mutating git worktree commands are denied in favor of wp worktree', async () => {
    const routeCommand = await getRoute()
    for (const command of [
      'git worktree add ../x',
      'git worktree remove ../x',
      'git worktree move a b',
      'git worktree prune',
    ]) {
      const result = routeCommand(command)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') {
        expect(result.action.guidance).toContain('Use `wp worktree` instead')
      }
    }
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

  it('extracts vp test commands embedded inside wp_session_execute code', async () => {
    const { extractRoutableCommandsFromToolInput, routeCommand } = await import('./dev-routing.js')
    const commands = extractRoutableCommandsFromToolInput({
      tool_name: 'wp_session_execute',
      tool_input: {
        language: 'javascript',
        code: "execFileSync('vp',['run','--filter=webpresso','test','src/audit/gitignore-agent-surfaces.test.ts'])",
      },
    })

    expect(commands).toContain(
      'vp run --filter=webpresso test src/audit/gitignore-agent-surfaces.test.ts',
    )
    const result = routeCommand(commands[0] ?? '')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.guidance).toContain('wp_test')
    }
  })

  it('extracts shell wp_session_execute commands and routes them to matching MCP tools', async () => {
    const { extractRoutableCommandsFromToolInput, routeCommand } = await import('./dev-routing.js')
    for (const [code, expectedCommand, expectedTool] of [
      [
        [
          'cd /Users/ozby/repos/webpresso/_worktrees/webpresso-secret-aware-mcp && vp run test -- \\',
          '  src/secret-gate/runner.test.ts src/ci/act-helper.test.ts \\',
          '  src/mcp/tools/ci-act.test.ts src/mcp/tools/worker-tail.test.ts \\',
          '  src/hooks/pretool-guard/dev-routing.test.ts',
        ].join('\n'),
        'vp run test -- src/secret-gate/runner.test.ts src/ci/act-helper.test.ts src/mcp/tools/ci-act.test.ts src/mcp/tools/worker-tail.test.ts src/hooks/pretool-guard/dev-routing.test.ts',
        'wp_test',
      ],
      [
        '# comment before command\nnpm exec -- vitest run src/hooks/pretool-guard/dev-routing.test.ts',
        'npm exec -- vitest run src/hooks/pretool-guard/dev-routing.test.ts',
        'wp_test',
      ],
      [
        'WP_SKIP_UPDATE_CHECK=1 vp exec vitest run src/mcp/blueprint-server.test.ts 2>&1 | tail -120',
        'WP_SKIP_UPDATE_CHECK=1 vp exec vitest run src/mcp/blueprint-server.test.ts 2>&1 | tail -120',
        'wp_test',
      ],
      [
        'env WP_SKIP_UPDATE_CHECK=1 vp exec vitest run src/mcp/blueprint-server.test.ts',
        'env WP_SKIP_UPDATE_CHECK=1 vp exec vitest run src/mcp/blueprint-server.test.ts',
        'wp_test',
      ],
      [
        'corepack pnpm@10 --dir apps/e2e exec playwright test e2e/smoke.spec.ts',
        'corepack pnpm@10 --dir apps/e2e exec playwright test e2e/smoke.spec.ts',
        'wp_e2e',
      ],
      [
        'with-secrets -- wrangler tail webpresso-chef-alpha --format json',
        'with-secrets -- wrangler tail webpresso-chef-alpha --format json',
        'wp_worker_tail',
      ],
      [
        'with-secrets -- act -W .github/workflows/ci.yml',
        'with-secrets -- act -W .github/workflows/ci.yml',
        'wp_ci_act',
      ],
      [
        'bun apps/scripts/src/ci/act.ts --workflow ci-generated-live-validation',
        'bun apps/scripts/src/ci/act.ts --workflow ci-generated-live-validation',
        'wp_ci_act',
      ],
    ] as const) {
      const commands = extractRoutableCommandsFromToolInput({
        tool_name: 'wp_session_execute',
        tool_input: {
          language: 'shell',
          code,
        },
      })

      expect(commands).toContain(expectedCommand)
      const result = routeCommand(expectedCommand)
      expect(result?.action.action).toBe('deny')
      if (result?.action.action === 'deny') {
        expect(result.action.tool).toBe(expectedTool)
      }
    }
  })

  it('extracts direct tool paths embedded inside wp_session_execute process calls', async () => {
    const { extractRoutableCommandsFromToolInput, routeCommand } = await import('./dev-routing.js')
    const commands = extractRoutableCommandsFromToolInput({
      tool_name: 'wp_session_execute',
      tool_input: {
        language: 'javascript',
        code: "execFileSync('../../node_modules/.bin/vitest',['run','src/routes/ci-stack.test.ts'])",
      },
    })

    expect(commands).toContain('../../node_modules/.bin/vitest run src/routes/ci-stack.test.ts')
    const result = routeCommand(commands[0] ?? '')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.tool).toBe('wp_test')
    }
  })

  it('extracts routed commands from wp_session_batch_execute command entries', async () => {
    const { extractRoutableCommandsFromToolInput, routeCommand } = await import('./dev-routing.js')
    const commands = extractRoutableCommandsFromToolInput({
      tool_name: 'wp_session_batch_execute',
      tool_input: {
        commands: [{ label: 'tests', command: 'vp run --filter=webpresso test' }],
      },
    })

    expect(commands).toEqual(['vp run --filter=webpresso test'])
    const result = routeCommand(commands[0] ?? '')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.guidance).toContain('wp_test')
    }
  })

  it('extracts routed commands from Codex MCP alias payload fields', async () => {
    const { extractRoutableCommandsFromToolInput } = await import('./dev-routing.js')
    const commands = extractRoutableCommandsFromToolInput({
      toolName: 'wp_session_execute',
      toolInput: {
        language: 'shell',
        code: 'vp run build 2>&1 | tail -160',
      },
    })

    expect(commands).toContain('vp run build 2>&1 | tail -160')
  })

  it('extracts routed commands from plugin-prefixed wp_session MCP tool names', async () => {
    const { extractRoutableCommandsFromToolInput, routeCommand } = await import('./dev-routing.js')
    const commands = extractRoutableCommandsFromToolInput({
      tool_name: 'mcp__plugin_example__wp_session_execute',
      tool_input: {
        language: 'shell',
        code: 'tsc --noEmit --pretty false',
      },
    })

    expect(commands).toContain('tsc --noEmit --pretty false')
    const result = routeCommand(commands[0] ?? '')
    expect(result?.action.action).toBe('deny')
    if (result?.action.action === 'deny') {
      expect(result.action.tool).toBe('wp_typecheck')
    }
  })
})
