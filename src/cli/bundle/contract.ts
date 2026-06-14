export interface CliCommandContext {
  readonly rawArgs?: readonly string[]
}

export interface CliCommand {
  readonly meta: {
    readonly description: string
    readonly name: string
  }
  readonly run?: (context: CliCommandContext) => void | Promise<void>
  readonly subCommands?: Record<string, () => CliCommand | Promise<CliCommand>>
}

export interface CliBundle {
  readonly commands: Record<string, CliCommand>
  readonly config: {
    readonly apiVersion: number
    readonly distributionProfiles: readonly string[]
    readonly hostRange: string
    readonly namespaceRoots: readonly string[]
  }
  readonly metadata: {
    readonly description: string
    readonly displayName: string
    readonly profiles: readonly string[]
    readonly roots: readonly string[]
    readonly visibility: string
  }
  readonly name: string
  readonly version: string
}
