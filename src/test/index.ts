import { spawn } from 'node:child_process'

export interface AgentKitTestRunOptions {
  file?: string
  package?: string
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

export function buildTestArgs(options: AgentKitTestRunOptions): string[] {
  const args = ['test']
  if (options.package) {
    args.push('--package', options.package)
  }
  if (options.file) {
    args.push('--file', options.file)
  }
  args.push(...(options.passthrough ?? []))
  return args
}

export async function runAgentKitTest(options: AgentKitTestRunOptions): Promise<number> {
  return runJust(buildTestArgs(options))
}
