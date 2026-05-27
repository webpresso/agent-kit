/**
 * `wp audit <kind>` — packaged repository audits.
 *
 * CAC shell: maps AuditOutcome → console output + process.exit.
 * All dispatch logic lives in audit-core.ts (no process.exit there).
 */
import type { CAC } from 'cac';
export declare function resolveGuardrailAuditKinds(root: string): string[];
export declare function registerAuditCommand(cli: CAC): void;
//# sourceMappingURL=audit.d.ts.map