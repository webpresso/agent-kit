// @ts-nocheck
// Webpresso monorepo path rules — replaces GritQL patterns:
// - no-hardcoded-repo-root (import.meta.dirname + '../..')
// - no-hardcoded-repo-root-dirname (__dirname + '../..')
// - no-cross-package-paths (single-arg)
// - no-cross-package-paths-multiarg
const RESOLVE_FUNCTIONS = new Set(['resolve', 'join']);
const QUALIFIED_RESOLVE = new Set(['path.resolve', 'path.join']);
function getCalleeName(callee) {
    if (callee.type === 'Identifier')
        return callee.name;
    if (callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.property.type === 'Identifier') {
        return `${callee.object.name}.${callee.property.name}`;
    }
    return null;
}
function isMetaDirname(node) {
    return (node.type === 'MemberExpression' &&
        node.object.type === 'MetaProperty' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'dirname');
}
function isDunderDirname(node) {
    return node.type === 'Identifier' && node.name === '__dirname';
}
function hasDoubleParentTraversal(value) {
    return typeof value === 'string' && /\.\.\/\.\./.test(value);
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
                const first = args[0];
                const isMetaDir = isMetaDirname(first);
                const isDunder = isDunderDirname(first);
                // Check any-arg variant: resolve(ANY_VAR, '../../..') or join(X, '../../../..')
                // This catches patterns like resolve(PACKAGE_ROOT, '..', '..', '..') and join(SCRIPT_DIR, '../../../..')
                for (let i = 1; i < args.length; i++) {
                    const arg = args[i];
                    if (arg.type === 'Literal' && hasDoubleParentTraversal(arg.value)) {
                        const source = isMetaDir ? 'import.meta.dirname' : isDunder ? '__dirname' : 'variable';
                        context.report({
                            node: arg,
                            message: `Hardcoded repo root via ${source} + relative path. Use findRepoRoot() from @webpresso/cli-utils/find-repo-root instead.`,
                        });
                        return;
                    }
                }
                // Multi-arg variant: join(X, '..', '..', '..') — 3+ parent segments from any starting point
                if (args.length >= 4) {
                    let parentCount = 0;
                    for (let i = 1; i < args.length; i++) {
                        if (args[i].type === 'Literal' && args[i].value === '..') {
                            parentCount++;
                        }
                    }
                    if (parentCount >= 2) {
                        const source = isMetaDir ? 'import.meta.dirname' : isDunder ? '__dirname' : 'variable';
                        context.report({
                            node: args[1],
                            message: `Hardcoded repo root via ${source} + multiple '../' segments. Use findRepoRoot() from @webpresso/cli-utils/find-repo-root instead.`,
                        });
                    }
                }
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
                    if (arg.type !== 'Literal' || typeof arg.value !== 'string')
                        continue;
                    if (/\.\./.test(arg.value) && MONOREPO_DIRS.test(arg.value)) {
                        context.report({
                            node: arg,
                            message: 'Cross-package path traversal via __dirname. Use proper package imports or findRepoRoot() instead.',
                        });
                        return;
                    }
                }
                // Multi-arg: resolve(__dirname, '..', '..', 'packages', 'cli2')
                const hasParent = args.some((a) => a.type === 'Literal' && a.value === '..');
                const hasMonoDir = args.some((a) => a.type === 'Literal' && typeof a.value === 'string' && MONOREPO_DIRS.test(a.value));
                if (hasParent && hasMonoDir) {
                    context.report({
                        node: args[1],
                        message: 'Cross-package path traversal via __dirname. Use proper package imports or findRepoRoot() instead.',
                    });
                }
            },
        };
    },
};
const plugin = {
    meta: { name: 'webpresso-monorepo' },
    rules: {
        'no-hardcoded-repo-root': noHardcodedRepoRoot,
        'no-cross-package-paths': noCrossPackagePaths,
    },
};
export default plugin;
//# sourceMappingURL=monorepo-paths.js.map