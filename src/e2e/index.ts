import { spawn } from 'node:child_process'

export interface AgentKitE2eRunOptions {
  file?: string
  suite?: string
  passthrough?: readonly string[]
}

function runJust(args: readonly string[]): Promise<number> {
  return new Promise<number>((resolve) => {
    const child = spawn('just', args, { stdio: 'inherit' })
    child.on('error', (error) => {
      console.error(`Failed to spawn just: ${error.message}`)
      resolve(1)
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

export function buildE2eArgs(options: AgentKitE2eRunOptions): string[] {
  const suite = options.suite ?? 'e2e'
  const args = [suite]
  if (options.file) {
    args.push('--file', options.file)
  }
  args.push(...(options.passthrough ?? []))
  return args
}

export async function runAgentKitE2e(options: AgentKitE2eRunOptions): Promise<number> {
  return runJust(buildE2eArgs(options))
}
