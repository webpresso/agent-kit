import type { RepoAuditResult } from "./repo-guardrails.js";
export declare function isIgnoredNoFirstPartyMjsPath(relativePath: string): boolean;
export declare function findTrackedFirstPartyMjsPaths(trackedPaths: readonly string[]): string[];
export declare function auditNoFirstPartyMjs(rootDirectory?: string): RepoAuditResult;
//# sourceMappingURL=no-first-party-mjs.d.ts.map