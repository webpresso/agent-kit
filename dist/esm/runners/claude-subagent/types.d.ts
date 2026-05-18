export interface SubagentOptions {
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal;
}
export type SubagentFn = (prompt: string, opts: SubagentOptions) => Promise<string>;
//# sourceMappingURL=types.d.ts.map