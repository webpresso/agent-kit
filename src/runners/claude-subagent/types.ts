// ---------------------------------------------------------------------------
// SubagentOptions — options forwarded to the subagent invocation
// ---------------------------------------------------------------------------

export interface SubagentOptions {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// SubagentFn — DI seam for the subagent invocation
//
// The default implementation (injected at runtime in Wave 4 / Task 4.1)
// calls the Agent tool. Tests inject a mock SubagentFn via the constructor.
// ---------------------------------------------------------------------------

export type SubagentFn = (prompt: string, opts: SubagentOptions) => Promise<string>;
