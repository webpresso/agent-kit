import { writeFileSync, type WriteFileOptions } from 'node:fs'

export interface WriteJsonFileOptions {
  readonly indent?: number
  readonly trailingNewline?: boolean
  readonly writeFileOptions?: WriteFileOptions
}

export function writeJsonFile(
  path: string,
  data: unknown,
  options: WriteJsonFileOptions = {},
): void {
  const indent = options.indent ?? 2
  const trailingNewline = options.trailingNewline ?? true
  const spacing = indent === 0 ? undefined : indent
  const text = JSON.stringify(data, null, spacing)
  writeFileSync(path, `${text}${trailingNewline ? '\n' : ''}`, options.writeFileOptions)
}
