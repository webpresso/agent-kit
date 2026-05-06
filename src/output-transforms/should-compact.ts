export interface ShouldCompactOptions {
  readonly flag?: boolean
  readonly env?: NodeJS.ProcessEnv
  readonly isTTY?: boolean
}

export function shouldCompact(options: ShouldCompactOptions = {}): boolean {
  if (options.flag !== undefined) return options.flag

  const sourceEnv = options.env ?? process.env
  const envValue =
    sourceEnv.QUALITY_ENGINE_COMPACT ??
    sourceEnv.AK_COMPACT
  if (envValue !== undefined) return parseBooleanEnv(envValue)

  const isTTY = options.isTTY ?? process.stdout.isTTY ?? false
  return !isTTY
}

function parseBooleanEnv(value: string): boolean {
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}
