import { spawnSync } from 'node:child_process';
import { loadDeployAdapter } from './load-adapter.js';
import { parseDeployLane, validateDeployPlan } from './schema.js';
import { getManagedRunner } from '#tool-runtime';
export async function createDeployPlan(options) {
    const cwd = options.cwd ?? process.cwd();
    const loadedAdapter = await loadDeployAdapter(cwd);
    if (!loadedAdapter) {
        throw new Error('No deploy adapter configured. Add deploy.adapterModule to agent-kit.config.ts.');
    }
    const lane = parseDeployLane(options.lane);
    const request = {
        cwd,
        lane,
        dryRun: Boolean(options.dryRun),
        env: process.env,
        cloudflare: loadedAdapter.config.deploy?.cloudflare,
    };
    return validateDeployPlan(await loadedAdapter.adapter.createPlan(request));
}
export async function runDeployPlan(options) {
    const plan = await createDeployPlan(options);
    if (options.planJson) {
        console.log(JSON.stringify(plan, null, 2));
        return 0;
    }
    for (const step of plan.steps) {
        const code = runDeployStep(step);
        if (code !== 0)
            return code;
    }
    return 0;
}
function runDeployStep(step) {
    const label = step.label ?? step.id;
    console.error(`[deploy] ${label}`);
    const command = resolveStepCommand(step);
    const result = spawnSync(command.command, command.args, {
        cwd: step.cwd,
        env: { ...process.env, ...step.env },
        stdio: 'inherit',
    });
    return result.status ?? 1;
}
function resolveStepCommand(step) {
    if (step.kind === 'command') {
        return { command: step.command, args: [...(step.args ?? [])] };
    }
    const resolution = getManagedRunner(step.tool, { outputPolicy: 'structured' });
    return { command: resolution.command, args: [...resolution.args, ...(step.args ?? [])] };
}
//# sourceMappingURL=run.js.map