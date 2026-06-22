/**
 * Shared shell-command identity primitive for hook trust normalization.
 *
 * Generated webpresso hooks no longer use node_modules bins or managed shell
 * launchers; normal hook ownership is identified from direct `wp hook <name>`
 * commands at the call site. This helper remains for generic quoted command
 * normalization in global adapter code.
 */
export function stripSingleShellQuotePair(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1)
  }
  return value
}
