// @ts-nocheck
// Webpresso monorepo path rules — replaces GritQL patterns:
// - no-hardcoded-repo-root (import.meta.dirname + '../..')
// - no-hardcoded-repo-root-dirname (__dirname + '../..')
// - no-cross-package-paths (single-arg)
// - no-cross-package-paths-multiarg
const RESOLVE_FUNCTIONS = new Set(["resolve", "join"]);
const QUALIFIED_RESOLVE = new Set(["path.resolve", "path.join"]);
function getCalleeName(callee) {
    if (callee.type === "Identifier")
        return callee.name;
    if (callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.property.type === "Identifier") {
        return `${callee.object.name}.${callee.property.name}`;
    }
    return null;
}
function isMetaDirname(node) {
    return (node.type === "MemberExpression" &&
        node.object.type === "MetaProperty" &&
        node.property.type === "Identifier" &&
        node.property.name === "dirname");
}
function isDunderDirname(node) {
    return node.type === "Identifier" && node.name === "__dirname";
}
// Count parent-directory ('..') segments in a single path-literal value.
// Handles a combined literal ('../..' → 2) and both path separators.
function countParentSegments(value) {
    if (typeof value !== "string")
        return 0;
    return value.split(/[/\\]/u).filter((segment) => segment === "..").length;
}
// Total '..' traversal depth across the resolve/join arguments after the
// anchor. Returns { depth, index } pointing at the first traversal argument
// when depth >= 2 (the repo-root-climb threshold), else null.
//
// Unifying the single-literal ('../..') and multi-argument ('..', '..') forms
// into one depth count closes a gap: the previous matcher only caught the
// multi-argument form at 4+ arguments, so `join(import.meta.dirname, '..',
// '..')` (two separate '..' args, depth 2) silently passed.
export function hardcodedRepoRootDepth(args) {
    let depth = 0;
    let index = -1;
    for (let i = 1; i < args.length; i += 1) {
        const arg = args[i];
        if (arg.type !== "Literal")
            continue;
        const segments = countParentSegments(arg.value);
        if (segments > 0 && index === -1)
            index = i;
        depth += segments;
    }
    return depth >= 2 && index !== -1 ? { depth, index } : null;
}
const noHardcodedRepoRoot = {
    create(context) {
        return {
            CallExpression(node) {
                const name = getCalleeName(node.callee);
                if (!name)
                    return;
                if (!RESOLVE_FUNCTIONS.has(name) && !QUALIFIED_RESOLVE.has(name))
                    return;
                const args = node.arguments;
                if (args.length < 2)
                    return;
                const violation = hardcodedRepoRootDepth(args);
                if (!violation)
                    return;
                const first = args[0];
                const source = isMetaDirname(first)
                    ? "import.meta.dirname"
                    : isDunderDirname(first)
                        ? "__dirname"
                        : "variable";
                context.report({
                    node: args[violation.index],
                    message: `Hardcoded repo root via ${source} + '..' traversal (depth ${violation.depth}). Derive the repo root dynamically — search upward for a workspace marker such as pnpm-workspace.yaml (e.g. findRepoRoot) — instead of hardcoding the directory depth.`,
                });
            },
        };
    },
};
const MONOREPO_DIRS = /(?:packages|apps|tooling|infra)/;
const noCrossPackagePaths = {
    create(context) {
        return {
            CallExpression(node) {
                const name = getCalleeName(node.callee);
                if (!name)
                    return;
                if (!RESOLVE_FUNCTIONS.has(name) && !QUALIFIED_RESOLVE.has(name))
                    return;
                const args = node.arguments;
                if (args.length < 2)
                    return;
                const first = args[0];
                if (!isDunderDirname(first) && !isMetaDirname(first))
                    return;
                // Single-arg: resolve(__dirname, '../../../packages/foo')
                for (let i = 1; i < args.length; i++) {
                    const arg = args[i];
                    if (arg.type !== "Literal" || typeof arg.value !== "string")
                        continue;
                    if (/\.\./.test(arg.value) && MONOREPO_DIRS.test(arg.value)) {
                        context.report({
                            node: arg,
                            message: "Cross-package path traversal via __dirname. Use proper package imports or findRepoRoot() instead.",
                        });
                        return;
                    }
                }
                // Multi-arg: resolve(__dirname, '..', '..', 'packages', 'cli2')
                const hasParent = args.some((a) => a.type === "Literal" && a.value === "..");
                const hasMonoDir = args.some((a) => a.type === "Literal" && typeof a.value === "string" && MONOREPO_DIRS.test(a.value));
                if (hasParent && hasMonoDir) {
                    context.report({
                        node: args[1],
                        message: "Cross-package path traversal via __dirname. Use proper package imports or findRepoRoot() instead.",
                    });
                }
            },
        };
    },
};
const plugin = {
    meta: { name: "webpresso-monorepo" },
    rules: {
        "no-hardcoded-repo-root": noHardcodedRepoRoot,
        "no-cross-package-paths": noCrossPackagePaths,
    },
};
export default plugin;
//# sourceMappingURL=monorepo-paths.js.map