import { cac } from 'cac'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const printHooksDoctor = vi.hoisted(() => vi.fn())
const statusCommand = vi.hoisted(() => vi.fn())
const dispatchCommand = vi.hoisted(() => vi.fn())
const demoCommand = vi.hoisted(() => vi.fn())
const hooksUpgradeCommand = vi.hoisted(() => vi.fn())
const hooksErrorsCommand = vi.hoisted(() => vi.fn())

vi.mock('#hooks/doctor', () => ({
  printHooksDoctor,
}))

vi.mock('#hooks/status/index.js', () => ({
  statusCommand,
}))

vi.mock('#hooks/dispatch/index.js', () => ({
  dispatchCommand,
}))

vi.mock('#hooks/demo/index.js', () => ({
  demoCommand,
}))

vi.mock('#cli/commands/hooks-upgrade/index.js', () => ({
  hooksUpgradeCommand,
}))

vi.mock('#hooks/errors/index.js', () => ({
  hooksErrorsCommand,
}))

import { registerHooksCommand } from './hooks.js'

async function runHooksCli(argv: string[]): Promise<void> {
  const cli = cac('wp')
  registerHooksCommand(cli)
  cli.parse(['node', 'wp', ...argv], { run: false })
  await cli.runMatchedCommand()
}

describe('registerHooksCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wires hooks status to the status command without vendor flags by default', async () => {
    await runHooksCli(['hooks', 'status'])
    expect(statusCommand).toHaveBeenCalledWith([])
  })

  it('passes the vendor flag through to hooks status', async () => {
    await runHooksCli(['hooks', 'status', '--vendor', 'codex'])
    expect(statusCommand).toHaveBeenCalledWith(['--vendor', 'codex'])
    expect(printHooksDoctor).not.toHaveBeenCalled()
  })

  it('wires hooks dispatch to the dispatch command with dry-run and vendor args', async () => {
    await runHooksCli(['hooks', 'dispatch', 'Stop', '--vendor', 'codex', '--dry-run'])
    expect(dispatchCommand).toHaveBeenCalledWith(['Stop', '--vendor', 'codex', '--dry-run'])
  })

  it('wires hooks demo to the demo command with event, vendor, and tool args', async () => {
    await runHooksCli(['hooks', 'demo', 'PreToolUse', '--vendor', 'claude', '--tool', 'Bash'])
    expect(demoCommand).toHaveBeenCalledWith(['PreToolUse', '--vendor', 'claude', '--tool', 'Bash'])
  })

  it('wires hooks upgrade to the upgrade command', async () => {
    await runHooksCli(['hooks', 'upgrade', '--workspace', '--apply'])
    expect(hooksUpgradeCommand).toHaveBeenCalledWith(['--workspace', '--apply'])
  })

  it('wires hooks errors to the errors command with json and limit args', async () => {
    await runHooksCli(['hooks', 'errors', '--json', '--limit', '3'])
    expect(hooksErrorsCommand).toHaveBeenCalledWith(['--json', '--limit', '3'])
  })

  it('calls printHooksDoctor when no subcommand is provided', async () => {
    printHooksDoctor.mockResolvedValue(0)
    await runHooksCli(['hooks'])
    expect(printHooksDoctor).toHaveBeenCalledWith({
      skipMcp: undefined,
      hosts: 'auto',
      hostNames: [],
    })
  })

  it('passes through skipMcp, hosts, and host filters for hooks doctor', async () => {
    printHooksDoctor.mockResolvedValue(0)
    await runHooksCli(['hooks', 'doctor', '--skip-mcp', '--hosts', 'required', '--host', 'codex'])
    expect(printHooksDoctor).toHaveBeenCalledWith({
      skipMcp: true,
      hosts: 'required',
      hostNames: ['codex'],
    })
  })

  it('passes through the --fix flag for hooks doctor', async () => {
    printHooksDoctor.mockResolvedValue(0)
    await runHooksCli(['hooks', 'doctor', '--fix'])
    expect(printHooksDoctor).toHaveBeenCalledWith({
      skipMcp: undefined,
      fix: true,
      hosts: 'auto',
      hostNames: [],
    })
  })

  it('returns the exit code from printHooksDoctor', async () => {
    printHooksDoctor.mockResolvedValue(1)
    const cli = cac('wp')
    registerHooksCommand(cli)
    cli.parse(['node', 'wp', 'hooks'], { run: false })
    const result = await cli.runMatchedCommand()
    expect(result).toEqual(1)
  })
})
