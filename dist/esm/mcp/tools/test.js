/**
 * `ak_test` MCP tool.
 *
 * Routes test execution to either `just` (when a `justfile` is present in cwd)
 * or `pnpm` (when only `pnpm-workspace.yaml` is present), with an explicit
 * `backend` override. Returns a structured `{passed, output, exitCode}` payload
 * wrapped in MCP `text` content blocks.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import * as justBackend from '#mcp/backends/just';
import * as pnpmBackend from '#mcp/backends/pnpm';
const inputSchema = z.object({
    packages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    suite: z.enum(['unit', 'integration', 'e2e']).optional(),
    backend: z.enum(['just', 'pnpm', 'auto']).optional().default('auto'),
});
function detectBackend(cwd, override) {
    if (override === 'just' || override === 'pnpm')
        return override;
    if (existsSync(join(cwd, 'justfile')))
        return 'just';
    return 'pnpm';
}
const tool = {
    name: 'ak_test',
    description: 'Run tests via the project test backend. Auto-detects `just` (when a justfile is present) or `pnpm` (workspace fallback); supports an explicit override via `backend`.',
    inputSchema,
    // Tests SHOULD be deterministic + side-effect-free, but we can't prove it
    // for arbitrary user code, so leave `idempotentHint` unset (defaults false)
    // and set `readOnlyHint: false`. Tests can mutate dev DBs, write fixtures,
    // etc. — clients should treat invocation as observable side effects.
    annotations: {
        title: 'Test',
        destructiveHint: false,
        openWorldHint: false,
    },
    handler: async (raw) => {
        const input = inputSchema.parse(raw ?? {});
        const cwd = process.cwd();
        const backend = detectBackend(cwd, input.backend);
        const runner = backend === 'just' ? justBackend : pnpmBackend;
        const result = await runner.runTests({
            packages: input.packages,
            files: input.files,
        });
        const payload = {
            passed: result.passed,
            output: result.output,
            exitCode: result.exitCode,
            backend,
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
        };
    },
};
export default tool;
//# sourceMappingURL=test.js.map