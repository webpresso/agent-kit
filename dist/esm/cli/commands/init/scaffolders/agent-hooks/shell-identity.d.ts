/**
 * Shared shell-command identity primitive for hook trust normalization.
 *
 * Generated webpresso hooks no longer use node_modules bins or managed shell
 * launchers; normal hook ownership is identified from direct `wp hook <name>`
 * commands at the call site. This helper remains for generic quoted command
 * normalization in global adapter code.
 */
export declare function stripSingleShellQuotePair(value: string): string;
//# sourceMappingURL=shell-identity.d.ts.map