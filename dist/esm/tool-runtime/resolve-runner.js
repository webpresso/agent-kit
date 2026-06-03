import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MANAGED_TOOL_PREFIX = {
    oxfmt: { packageName: 'oxfmt', binName: 'oxfmt' },
    oxlint: { packageName: 'oxlint', binName: 'oxlint' },
    playwright: { packageName: '@playwright/test', binName: 'playwright' },
    stryker: { packageName: '@stryker-mutator/core', binName: 'stryker' },
    tsc: { packageName: 'typescript', binName: 'tsc' },
    tsx: { packageName: 'tsx', binName: 'tsx' },
    vite: { packageName: 'vite', binName: 'vite' },
    vitest: { packageName: 'vitest', binName: 'vitest' },
    vp: { command: 'vp', args: [] },
    wrangler: { packageName: 'wrangler', binName: 'wrangler' },
};
function withOptionalRtk(resolution, outputPolicy) {
    if (outputPolicy !== 'rtk-filtered')
        return resolution;
    return {
        ...resolution,
        command: 'rtk',
        args: [resolution.command, ...resolution.args],
    };
}
export function resolveRunner(tool, options = {}) {
    const normalized = tool.trim();
    if (!normalized) {
        throw new Error('tool runtime resolution requires a non-empty tool name');
    }
    const outputPolicy = options.outputPolicy ?? (options.filterOutput === false ? 'structured' : 'rtk-filtered');
    const managed = MANAGED_TOOL_PREFIX[normalized];
    if (managed) {
        return withOptionalRtk(resolveManagedTool(normalized, managed), outputPolicy);
    }
    if (options.fallbackCommand) {
        return withOptionalRtk({
            tool: normalized,
            command: options.fallbackCommand,
            args: [...(options.fallbackArgs ?? [])],
            source: 'fallback',
        }, outputPolicy);
    }
    throw new Error(`No managed runtime runner is defined for tool "${normalized}"`);
}
function resolveManagedTool(tool, spec) {
    if ('command' in spec) {
        return { tool, command: spec.command, args: [...spec.args], source: 'managed' };
    }
    const binPath = resolvePackageBin(spec.packageName, spec.binName);
    if (binPath) {
        return { tool, command: binPath, args: [...(spec.fallbackArgs ?? [])], source: 'managed' };
    }
    return { tool, command: 'vp', args: ['exec', spec.binName], source: 'fallback' };
}
function resolvePackageBin(packageName, binName) {
    try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        const relativeBin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];
        if (!relativeBin)
            return null;
        const absoluteBin = resolve(dirname(packageJsonPath), relativeBin);
        return existsSync(absoluteBin) ? absoluteBin : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=resolve-runner.js.map