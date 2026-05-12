/**
 * Shared CLI dispatch for `ak rule` and `ak skill` subcommands.
 *
 * Subcommands handled here are kind-agnostic — `new | list | show |
 * deprecate`. Per-kind additions (e.g. `ak skill install`) are implemented
 * in the thin command shims, not here.
 */
import { type ContentKind, type ContentSource } from './loader.js';
export type ContentSubcommand = 'new' | 'list' | 'show' | 'deprecate';
export interface DispatchOptions {
    cwd: string;
    catalogDir: string;
    source?: ContentSource;
    status?: 'active' | 'deprecated';
    scope?: string;
    title?: string;
    reason?: string;
    dryRun?: boolean;
}
export interface DispatchInput {
    kind: ContentKind;
    sub: ContentSubcommand;
    args: readonly string[];
    options: DispatchOptions;
}
export interface DispatchResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}
export declare function dispatchContent(input: DispatchInput): Promise<DispatchResult>;
//# sourceMappingURL=dispatch.d.ts.map