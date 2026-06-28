/**
 * `wp audit <kind>` — packaged repository audits.
 *
 * CAC shell: maps AuditOutcome → console output + process.exit.
 * All dispatch logic lives in audit-core.ts (no process.exit there).
 */
import type { CAC } from "cac";
export type AuditScope = "full" | "affected";
export type AuditScopeSafety = "affected-safe" | "full-scan-only";
export declare function getAuditScopeSafety(kind: string): AuditScopeSafety;
export declare function resolveGuardrailAuditKinds(root: string, scope?: AuditScope): string[];
export declare function registerAuditCommand(cli: CAC): void;
//# sourceMappingURL=audit.d.ts.map