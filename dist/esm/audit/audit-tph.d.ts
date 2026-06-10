#!/usr/bin/env bun
/**
 * Audit: Testing Philosophy Helper (TPH)
 *
 * Detects testing philosophy violations that GritQL patterns cannot express:
 * - Files with >3 vi.mock() calls (over-mocking)
 * - .test.ts files that mock internal @myorg/* packages (should be .integration.test.ts)
 *
 * GritQL handles: toBeTruthy/toBeFalsy, toBeDefined/toBeUndefined, bare toHaveBeenCalled,
 *                 vi.mock('@myorg/*') detection.
 *
 * Usage:
 *   just audit-tph
 *   bun apps/scripts/src/audit/audit-tph.ts [--max-mocks N]
 */
export {};
//# sourceMappingURL=audit-tph.d.ts.map