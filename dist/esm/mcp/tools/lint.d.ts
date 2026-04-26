/**
 * `ak_lint` MCP tool.
 *
 * Runs `oxlint` (preferred — fast, structured JSON output) on the supplied
 * files (or `.` when none are given). When the `oxlint` binary is absent on
 * PATH, falls back to `pnpm lint`. Returns a structured payload:
 *
 *   {
 *     passed: boolean,
 *     issues: Array<{file, line, rule, message}>,
 *     backend: 'oxlint' | 'pnpm',
 *     exitCode: number,
 *     output?: string,   // only on the pnpm fallback
 *   }
 *
 * The pnpm fallback intentionally does NOT parse output — `pnpm lint` aggregates
 * heterogeneous per-package linters whose stdout shapes differ. Raw output is
 * passed through in `output` for human inspection.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '../auto-discover.js';
declare const inputSchema: z.ZodObject<{
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    fix: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type AkLintInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=lint.d.ts.map