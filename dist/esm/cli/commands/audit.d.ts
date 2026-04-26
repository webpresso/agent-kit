/**
 * `ak audit <kind>` — packaged repository audits.
 *
 * TPH audits remain script-backed for now because they are Bun-native
 * entrypoints. Repo guardrail audits are library-backed so consumers can
 * use the same logic from the CLI and from `@webpresso/agent-kit/local`.
 */
import type { CAC } from 'cac';
export declare function registerAuditCommand(cli: CAC): void;
//# sourceMappingURL=audit.d.ts.map