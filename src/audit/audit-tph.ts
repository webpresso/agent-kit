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

import { printResults, runTphAudit } from "./audit-tph-runner.js";

function parseArgs(): { maxMocks: number | undefined } {
  const args = process.argv.slice(2);
  let maxMocks: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const next = args[i + 1] as string | undefined;
    if (arg === "--max-mocks" && next) {
      maxMocks = Number.parseInt(next, 10);
      i++;
    }
  }

  return { maxMocks };
}

if (import.meta.main) {
  const { maxMocks } = parseArgs();
  const root = process.cwd();
  runTphAudit(root, maxMocks !== undefined ? { maxMocks } : undefined)
    .then((result) => {
      printResults(result);
      if (result.errorCount > 0) process.exit(1);
    })
    .catch((error: unknown) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
