/**
 * Render `catalog/AGENTS.md.tpl` into the consumer's `AGENTS.md`.
 *
 * Placeholders:
 * - {{REPOSITORY_MAP}}: bulleted list of workspace packages, or "single-package" fallback.
 * - {{TECH_STACK}}: detected from package.json deps.
 * - {{ESCALATION_MAP}}: TODO placeholder.
 * - {{DURABLE_PLANNING_ROOT}}: from .agent-kitrc.json, defaulting to `.agent/planning/`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DURABLE_PLANNING_ROOT } from './config.js';
import { writeFileMerged } from './merge.js';
const TECH_STACK_RULES = [
    { dep: /^react(-dom)?$/, label: 'React' },
    { dep: /^next$/, label: 'Next.js' },
    { dep: /^@remix-run\//, label: 'Remix' },
    { dep: /^@tanstack\/react-query$/, label: 'TanStack Query' },
    { dep: /^hono$/, label: 'Hono' },
    { dep: /^drizzle-orm$/, label: 'Drizzle ORM' },
    { dep: /^@cloudflare\/workers-types$/, label: 'Cloudflare Workers' },
    { dep: /^wrangler$/, label: 'Cloudflare Workers (wrangler)' },
    { dep: /^pg$|^postgres$|^@neondatabase\//, label: 'PostgreSQL' },
    { dep: /^better-auth$/, label: 'better-auth' },
    { dep: /^vitest$/, label: 'Vitest' },
    { dep: /^@playwright\/test$/, label: 'Playwright' },
    { dep: /^zod$/, label: 'Zod' },
    { dep: /^typescript$/, label: 'TypeScript' },
];
export function renderRepositoryMap(consumer) {
    const packages = consumer.workspacePackages;
    if (packages.length === 0) {
        const name = consumer.packageJson?.name ?? 'this project';
        return `Single-package project: \`${name}\` (root: \`${consumer.repoRoot}\`).`;
    }
    return packages.map((p) => `- \`${p.name}\` — \`${p.relativePath}\``).join('\n');
}
export function renderTechStack(consumer) {
    const deps = {
        ...consumer.packageJson?.dependencies,
        ...consumer.packageJson?.devDependencies,
    };
    const depNames = Object.keys(deps);
    const matches = new Set();
    for (const name of depNames) {
        for (const rule of TECH_STACK_RULES) {
            if (rule.dep.test(name))
                matches.add(rule.label);
        }
    }
    if (matches.size === 0) {
        return '{{TODO: list the tech stack (frameworks, DB, runtime) for this repo.}}';
    }
    return Array.from(matches)
        .toSorted()
        .map((label) => `- ${label}`)
        .join('\n');
}
export function renderAgentsMd(template, consumer, config) {
    const replacements = {
        '{{REPOSITORY_MAP}}': renderRepositoryMap(consumer),
        '{{TECH_STACK}}': renderTechStack(consumer),
        '{{ESCALATION_MAP}}': '{{TODO: populate escalation map — who to ping for which subsystem.}}',
        '{{DURABLE_PLANNING_ROOT}}': config.durablePlanningRoot || DEFAULT_DURABLE_PLANNING_ROOT,
    };
    let output = template;
    for (const [key, value] of Object.entries(replacements)) {
        output = output.split(key).join(value);
    }
    return output;
}
export function scaffoldAgentsMd(input) {
    const { catalogDir, repoRoot, consumer, config, options } = input;
    const tplPath = join(catalogDir, 'AGENTS.md.tpl');
    if (!existsSync(tplPath))
        return null;
    const template = readFileSync(tplPath, 'utf8');
    const rendered = renderAgentsMd(template, consumer, config);
    const target = join(repoRoot, 'AGENTS.md');
    return writeFileMerged(target, rendered, options);
}
//# sourceMappingURL=scaffold-agents-md.js.map