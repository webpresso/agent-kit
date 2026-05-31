import type { CAC } from 'cac'

const HOOK_NAMES = [
  'pretool-guard',
  'post-tool',
  'stop-qa',
  'guard-switch',
  'sessionstart-routing',
] as const

export type HookName = (typeof HOOK_NAMES)[number]

const HOOK_HANDLERS: Readonly<Record<HookName, () => Promise<void>>> = {
  'pretool-guard': async () => {
    const { main } = await import('#hooks/pretool-guard/index')
    await main()
  },
  'post-tool': async () => {
    const { main } = await import('#hooks/post-tool/lint-after-edit')
    await main()
  },
  'stop-qa': async () => {
    const { main } = await import('#hooks/stop/qa-changed-files')
    await main()
  },
  'guard-switch': async () => {
    const { main } = await import('#hooks/guard-switch/index')
    await main()
  },
  'sessionstart-routing': async () => {
    const { main } = await import('#hooks/sessionstart/index')
    await main()
  },
}

export function isHookName(value: string): value is HookName {
  return value in HOOK_HANDLERS
}

export async function runHookCommand(name: string): Promise<void> {
  if (!isHookName(name)) {
    throw new Error(`Unknown hook "${name}". Expected one of: ${HOOK_NAMES.join(', ')}`)
  }
  await HOOK_HANDLERS[name]()
}

export function registerHookCommand(cli: CAC): void {
  cli
    .command('hook <name>', 'Run an internal plugin hook entrypoint')
    .action(async (name: string) => {
      await runHookCommand(name)
      return 0
    })
}
