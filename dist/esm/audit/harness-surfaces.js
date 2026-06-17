import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
export const HARNESS_SURFACES_MANIFEST_PATH = 'catalog/agent/harness-surfaces.yaml';
export const HARNESS_GATE_WORKFLOW_PATH = '.github/workflows/harness-gate.yml';
const harnessGateWorkflowSchema = z
    .object({
    on: z
        .object({
        pull_request: z
            .object({
            paths: z.array(z.string().trim().min(1)),
        })
            .passthrough(),
    })
        .passthrough(),
})
    .passthrough();
const surfaceKindSchema = z.enum([
    'hook',
    'generated-surface',
    'runtime-state',
    'regression-gate',
    'overlay',
    'policy',
    'secret-gate',
]);
const surfaceLifecycleSchema = z.enum(['locked', 'governed', 'experimental']);
const surfaceOwnerSchema = z.enum(['agent-kit', 'oh-my-codex']);
const surfacePathStatusSchema = z.enum(['concrete', 'projected']);
export const harnessSurfacePathSchema = z
    .object({
    path: z.string().trim().min(1),
    status: surfacePathStatusSchema,
})
    .strict();
export const harnessSurfaceSchema = z
    .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().trim().min(1),
    owner: surfaceOwnerSchema,
    kind: surfaceKindSchema,
    lifecycle: surfaceLifecycleSchema,
    paths: z.array(harnessSurfacePathSchema).min(1),
    triggers: z.array(z.string().trim().min(1)).min(1),
    evidence: z.array(z.string().trim().min(1)).min(1),
})
    .strict();
export const harnessSurfacesManifestSchema = z
    .object({
    version: z.literal(1),
    surfaces: z.array(harnessSurfaceSchema).min(1),
})
    .strict();
const REQUIRED_SURFACE_IDS = [
    'codex-hooks',
    'claude-hooks',
    'generated-agent-surfaces',
    'permission-policy',
    'secret-gate',
    'omx-runtime-state',
    'harness-regression-gate',
    'agent-overlays',
];
const PERMANENTLY_LOCKED_SURFACE_IDS = [
    'codex-hooks',
    'claude-hooks',
    'generated-agent-surfaces',
    'permission-policy',
    'secret-gate',
];
const BOUNDED_HARNESS_ROOTS = [
    { path: 'src/hooks', surfaceId: 'codex-hooks' },
    { path: 'src/hooks', surfaceId: 'claude-hooks' },
    { path: 'catalog/agent/agents', surfaceId: 'generated-agent-surfaces' },
    { path: 'catalog/agent/rules', surfaceId: 'generated-agent-surfaces' },
    { path: 'catalog/agent/skills', surfaceId: 'generated-agent-surfaces' },
    { path: 'src/hooks/pretool-guard', surfaceId: 'permission-policy' },
    { path: 'src/secret-gate', surfaceId: 'secret-gate' },
    { path: 'bin/with-secrets', surfaceId: 'secret-gate' },
    { path: 'catalog/agent/harness-gate', surfaceId: 'harness-regression-gate' },
    { path: 'scripts/bench/harness-gate', surfaceId: 'harness-regression-gate' },
    { path: 'src/symlinker', surfaceId: 'agent-overlays' },
];
export function readHarnessSurfacesManifest(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const manifestPath = resolve(root, options.manifestPath ?? HARNESS_SURFACES_MANIFEST_PATH);
    const parsed = parseYaml(readFileSync(manifestPath, 'utf8'));
    return harnessSurfacesManifestSchema.parse(parsed);
}
export function auditHarnessSurfaces(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const manifestRelativePath = options.manifestPath ?? HARNESS_SURFACES_MANIFEST_PATH;
    const manifestPath = resolve(root, manifestRelativePath);
    const violations = [];
    if (!existsSync(manifestPath)) {
        return {
            ok: false,
            title: 'Harness surfaces manifest',
            checked: 0,
            violations: [
                {
                    file: manifestRelativePath,
                    message: 'Missing canonical harness surface manifest.',
                },
            ],
        };
    }
    let manifest;
    try {
        manifest = readHarnessSurfacesManifest(root, { manifestPath: manifestRelativePath });
    }
    catch (error) {
        return {
            ok: false,
            title: 'Harness surfaces manifest',
            checked: 1,
            violations: [
                {
                    file: manifestRelativePath,
                    message: `Invalid harness surface manifest: ${formatError(error)}`,
                },
            ],
        };
    }
    const ids = new Set();
    const declaredPathsById = new Map();
    for (const surface of manifest.surfaces) {
        if (ids.has(surface.id)) {
            violations.push({
                file: manifestRelativePath,
                message: `Duplicate harness surface id: ${surface.id}`,
            });
        }
        ids.add(surface.id);
        const declaredPaths = new Set();
        declaredPathsById.set(surface.id, declaredPaths);
        for (const surfacePath of surface.paths) {
            const normalizedPath = normalizeRepoPath(root, surfacePath.path);
            if (!normalizedPath) {
                violations.push({
                    file: manifestRelativePath,
                    message: `${surface.id} references path outside the repo: ${surfacePath.path}`,
                });
                continue;
            }
            declaredPaths.add(normalizedPath);
            if (surfacePath.status === 'concrete') {
                if (!existsSync(resolve(root, normalizedPath))) {
                    violations.push({
                        file: manifestRelativePath,
                        message: `${surface.id} references missing concrete path: ${normalizedPath}`,
                    });
                }
            }
        }
        for (const evidencePath of surface.evidence) {
            const normalizedEvidencePath = normalizeRepoPath(root, evidencePath);
            if (!normalizedEvidencePath) {
                violations.push({
                    file: manifestRelativePath,
                    message: `${surface.id} references evidence outside the repo: ${evidencePath}`,
                });
                continue;
            }
            if (!existsSync(resolve(root, normalizedEvidencePath))) {
                violations.push({
                    file: manifestRelativePath,
                    message: `${surface.id} references missing evidence: ${normalizedEvidencePath}`,
                });
            }
        }
    }
    for (const requiredId of REQUIRED_SURFACE_IDS) {
        if (!ids.has(requiredId)) {
            violations.push({
                file: manifestRelativePath,
                message: `Missing required harness surface id: ${requiredId}`,
            });
        }
    }
    for (const lockedId of PERMANENTLY_LOCKED_SURFACE_IDS) {
        const surface = manifest.surfaces.find((candidate) => candidate.id === lockedId);
        if (surface && surface.lifecycle !== 'locked') {
            violations.push({
                file: manifestRelativePath,
                message: `${lockedId} is permanently locked and must use lifecycle: locked`,
            });
        }
    }
    for (const harnessRoot of BOUNDED_HARNESS_ROOTS) {
        const absolutePath = resolve(root, harnessRoot.path);
        if (!existsSync(absolutePath))
            continue;
        const declaredPaths = declaredPathsById.get(harnessRoot.surfaceId);
        if (!declaredPaths || !declaredPaths.has(harnessRoot.path)) {
            violations.push({
                file: manifestRelativePath,
                message: `Present harness root is not declared for ${harnessRoot.surfaceId}: ${harnessRoot.path}`,
            });
        }
    }
    validateHarnessGateWorkflowCoverage(root, manifest, violations);
    return {
        ok: violations.length === 0,
        title: 'Harness surfaces manifest',
        checked: manifest.surfaces.length,
        violations,
    };
}
function validateHarnessGateWorkflowCoverage(root, manifest, violations) {
    const workflowPath = resolve(root, HARNESS_GATE_WORKFLOW_PATH);
    if (!existsSync(workflowPath)) {
        violations.push({
            file: HARNESS_GATE_WORKFLOW_PATH,
            message: 'Missing harness gate workflow for manifest-backed path filters.',
        });
        return;
    }
    let filters;
    try {
        const workflow = harnessGateWorkflowSchema.parse(parseYaml(readFileSync(workflowPath, 'utf8')));
        filters = workflow.on.pull_request.paths;
    }
    catch (error) {
        violations.push({
            file: HARNESS_GATE_WORKFLOW_PATH,
            message: `Invalid harness gate workflow path filters: ${formatError(error)}`,
        });
        return;
    }
    for (const requiredPath of requiredWorkflowPaths(root, manifest)) {
        if (!filters.some((filter) => workflowFilterCoversPath(filter, requiredPath))) {
            violations.push({
                file: HARNESS_GATE_WORKFLOW_PATH,
                message: `Harness gate workflow pull_request.paths does not cover manifest path: ${requiredPath}`,
            });
        }
    }
}
function requiredWorkflowPaths(root, manifest) {
    const paths = new Set([HARNESS_SURFACES_MANIFEST_PATH]);
    for (const surface of manifest.surfaces) {
        for (const entry of surface.paths) {
            if (entry.status !== 'concrete')
                continue;
            const normalized = normalizeRepoPath(root, entry.path);
            if (normalized)
                paths.add(normalized);
        }
        for (const evidencePath of surface.evidence) {
            const normalized = normalizeRepoPath(root, evidencePath);
            if (normalized)
                paths.add(normalized);
        }
    }
    return [...paths].sort();
}
function workflowFilterCoversPath(filter, repoPath) {
    const normalizedFilter = filter.split('\\').join('/');
    const normalizedPath = repoPath.split('\\').join('/');
    if (normalizedFilter === normalizedPath)
        return true;
    if (normalizedFilter.endsWith('/**')) {
        const base = normalizedFilter.slice(0, -3);
        return normalizedPath === base || normalizedPath.startsWith(`${base}/`);
    }
    if (normalizedFilter.endsWith('/**/*')) {
        const base = normalizedFilter.slice(0, -5);
        return normalizedPath === base || normalizedPath.startsWith(`${base}/`);
    }
    return false;
}
function normalizeRepoPath(root, repoPath) {
    const absolutePath = resolve(root, repoPath);
    const relativePath = relative(root, absolutePath);
    if (relativePath === '' ||
        relativePath === '..' ||
        relativePath.startsWith('../') ||
        relativePath.startsWith('..\\')) {
        return undefined;
    }
    return relativePath.split('\\').join('/');
}
function formatError(error) {
    if (error instanceof z.ZodError)
        return error.issues.map((issue) => issue.message).join('; ');
    if (error instanceof Error)
        return error.message;
    return String(error);
}
//# sourceMappingURL=harness-surfaces.js.map