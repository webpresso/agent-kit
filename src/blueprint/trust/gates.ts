export function parseAllowedWpCommand(command: string): string[] {
  if (/[|;&`$<>]/u.test(command) || /\s--(?:fix|mutation)\b/u.test(command))
    throw new Error(`Rejected unsafe promotion gate command: ${command}`);
  const argv = command.trim().split(/\s+/u);
  const binary = argv[0];
  if (binary !== "wp" && binary !== "./bin/wp")
    throw new Error(`Promotion gates must use wp facade commands: ${command}`);
  const args = argv.slice(1);
  const sub = args[0];
  if (sub === "typecheck" || sub === "lint") {
    if (args.length !== 1)
      throw new Error(`Unsupported promotion gate wp ${sub} arguments: ${command}`);
    return [binary, ...args];
  }
  if (sub === "format") {
    if (args.length !== 2 || args[1] !== "--check")
      throw new Error(`Promotion gate wp format must be read-only: ${command}`);
    return [binary, ...args];
  }
  if (sub === "sync") {
    if (args.length !== 2 || args[1] !== "--check")
      throw new Error(`Promotion gate wp sync must be read-only: ${command}`);
    return [binary, ...args];
  }
  if (sub === "audit") {
    const [kind, ...rest] = args.slice(1);
    if (!kind || !/^[a-z0-9-]+$/u.test(kind))
      throw new Error(`Promotion gate wp audit requires an audit kind: ${command}`);
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      const next = rest[i + 1];
      if (arg === "--json" || arg === "--affected" || arg === "--branch") continue;
      if (arg === "--base" && next && !next.startsWith("-")) {
        i += 1;
        continue;
      }
      throw new Error(`Unsupported promotion gate wp audit arguments: ${command}`);
    }
    return [binary, ...args];
  }
  if (sub === "test") {
    const rest = args.slice(1);
    if (rest.length === 0) return [binary, ...args];
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      const next = rest[i + 1];
      if (arg !== "--file" || !next || next.startsWith("-"))
        throw new Error(`Unsupported promotion gate wp test arguments: ${command}`);
      i += 1;
    }
    return [binary, ...args];
  }
  throw new Error(`Unsupported promotion gate wp subcommand: ${sub ?? ""}`);
}
