import path from "node:path";
import ts from "typescript";
import { createCliLogSink } from "#cli/commands/quality-log-store.js";
export async function runAffectedTypecheck(options) {
    const repoRoot = path.resolve(options.repoRoot);
    const sink = createCliLogSink("typecheck", repoRoot);
    let plans;
    try {
        plans = planAffectedTypecheckClosures(options);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sink.write(`${message}\n`);
        const entry = await sink.finalize({
            exitCode: 1,
            summary: "typecheck failed: affected closure unavailable",
            options: { affected: true, files: [...options.files] },
        });
        return { exitCode: 1, entry, checkedFiles: [] };
    }
    const diagnostics = [];
    const checkedSet = new Set();
    for (const plan of plans) {
        sink.write(`Affected typecheck config: ${path.relative(repoRoot, plan.configPath) || plan.configPath}\n`);
        sink.write(`Affected typecheck changed files: ${plan.changedFiles.length}\n`);
        sink.write(`Affected typecheck reverse-dependency closure: ${plan.closureFiles.length}\n`);
        diagnostics.push(...collectAffectedDiagnostics(plan.program, plan.closureFiles));
        for (const file of plan.closureFiles)
            checkedSet.add(toRepoRelative(repoRoot, file.fileName));
    }
    if (diagnostics.length > 0) {
        sink.write(formatDiagnostics(diagnostics, repoRoot, Boolean(options.pretty)));
    }
    const checkedFiles = [...checkedSet].sort((a, b) => a.localeCompare(b));
    const exitCode = diagnostics.length === 0 ? 0 : 1;
    const entry = await sink.finalize({
        exitCode,
        summary: exitCode === 0 ? "typecheck passed" : `typecheck failed (exit ${exitCode})`,
        options: {
            affected: true,
            files: [...options.files],
            checkedFiles,
            resolvedScopes: ["affected-closure"],
        },
    });
    return { exitCode, entry, checkedFiles };
}
/**
 * Plan a reverse-closure typecheck per owning tsconfig.
 *
 * Each changed file is grouped under the nearest `tsconfig.json` walking up to
 * (and including) the repo root, so files under a workspace package's own
 * `tsconfig.json` (e.g. `packages/agent-config`) are typechecked in *their*
 * program instead of being dropped by the root program (whose `include` only
 * covers `src/**`). Fail-closed is preserved: if no closure plan can be built
 * for any changed file, this throws.
 */
export function planAffectedTypecheckClosures(options) {
    const repoRoot = path.resolve(options.repoRoot);
    const filesByConfig = new Map();
    for (const file of options.files) {
        const owningConfig = findOwningTsconfig(path.resolve(repoRoot, file), repoRoot);
        if (!owningConfig)
            continue;
        const group = filesByConfig.get(owningConfig) ?? [];
        group.push(file);
        filesByConfig.set(owningConfig, group);
    }
    const plans = [];
    for (const [configPath, files] of filesByConfig) {
        const plan = buildClosurePlanForConfig(configPath, repoRoot, files);
        if (plan)
            plans.push(plan);
    }
    if (plans.length === 0) {
        throw new Error("Affected typecheck found no changed files inside any active TypeScript program.");
    }
    return plans.sort((a, b) => a.configPath.localeCompare(b.configPath));
}
/**
 * Single-tsconfig closure planner (root program). Retained for the root-scoped
 * case and the closure unit tests; throws when the changed files are not inside
 * the resolved program.
 */
export function planAffectedTypecheckClosure(options) {
    const repoRoot = path.resolve(options.repoRoot);
    const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, "tsconfig.json");
    if (!configPath)
        throw new Error(`Unable to find tsconfig.json from ${repoRoot}`);
    const plan = buildClosurePlanForConfig(configPath, repoRoot, options.files);
    if (!plan) {
        throw new Error("Affected typecheck found no changed files inside the active TypeScript program.");
    }
    return plan;
}
function buildClosurePlanForConfig(configPath, repoRoot, files) {
    const configDir = path.dirname(configPath);
    const parsed = readTsConfig(configPath);
    const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        projectReferences: parsed.projectReferences,
    });
    const sourceFiles = program
        .getSourceFiles()
        .filter((sourceFile) => !sourceFile.isDeclarationFile && isWithin(sourceFile.fileName, configDir));
    const byCanonicalPath = new Map();
    for (const sourceFile of sourceFiles)
        byCanonicalPath.set(canonicalPath(sourceFile.fileName), sourceFile);
    const changedFiles = files
        .map((file) => path.resolve(repoRoot, file))
        .map((file) => byCanonicalPath.get(canonicalPath(file)))
        .filter((file) => file !== undefined);
    if (changedFiles.length === 0)
        return null;
    const reverseDependencies = buildReverseDependencyGraph(program, sourceFiles, byCanonicalPath);
    const closure = collectReverseClosure(changedFiles, reverseDependencies);
    return {
        program,
        configPath,
        changedFiles,
        closureFiles: [...closure].sort((a, b) => a.fileName.localeCompare(b.fileName)),
    };
}
/**
 * Nearest `tsconfig.json` governing `absFile`, searching from the file's
 * directory up to (and including) `repoRoot`. Returns null when no tsconfig
 * governs the file within the repo.
 */
function findOwningTsconfig(absFile, repoRoot) {
    const root = path.resolve(repoRoot);
    let dir = path.dirname(path.resolve(absFile));
    while (isWithin(dir, root)) {
        const candidate = path.join(dir, "tsconfig.json");
        if (ts.sys.fileExists(candidate))
            return candidate;
        if (dir === root)
            break;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
function readTsConfig(configPath) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error)
        throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath), undefined, configPath);
    if (parsed.errors.length > 0) {
        throw new Error(ts.formatDiagnostics(parsed.errors, diagnosticFormatHost(path.dirname(configPath))));
    }
    return parsed;
}
function buildReverseDependencyGraph(program, sourceFiles, byCanonicalPath) {
    const reverse = new Map();
    const options = program.getCompilerOptions();
    const host = ts.createCompilerHost(options, true);
    for (const sourceFile of sourceFiles) {
        for (const specifier of getModuleSpecifiers(sourceFile)) {
            const resolved = ts.resolveModuleName(specifier, sourceFile.fileName, options, host).resolvedModule;
            if (!resolved)
                continue;
            const imported = byCanonicalPath.get(canonicalPath(resolved.resolvedFileName));
            if (!imported)
                continue;
            const importers = reverse.get(imported) ?? new Set();
            importers.add(sourceFile);
            reverse.set(imported, importers);
        }
    }
    return reverse;
}
function getModuleSpecifiers(sourceFile) {
    const specifiers = [];
    const visit = (node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteralLike(node.moduleSpecifier)) {
            specifiers.push(node.moduleSpecifier.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return specifiers;
}
function collectReverseClosure(changedFiles, reverseDependencies) {
    const closure = new Set();
    const queue = [...changedFiles];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || closure.has(current))
            continue;
        closure.add(current);
        for (const importer of reverseDependencies.get(current) ?? [])
            queue.push(importer);
    }
    return closure;
}
export function collectAffectedDiagnostics(program, files) {
    const diagnostics = [];
    diagnostics.push(...program.getOptionsDiagnostics());
    diagnostics.push(...program.getGlobalDiagnostics());
    for (const file of files) {
        diagnostics.push(...program.getSyntacticDiagnostics(file));
        diagnostics.push(...program.getSemanticDiagnostics(file));
    }
    return diagnostics;
}
function formatDiagnostics(diagnostics, repoRoot, pretty) {
    const host = diagnosticFormatHost(repoRoot);
    return pretty
        ? ts.formatDiagnosticsWithColorAndContext(diagnostics, host)
        : ts.formatDiagnostics(diagnostics, host);
}
function diagnosticFormatHost(repoRoot) {
    return {
        getCurrentDirectory: () => repoRoot,
        getCanonicalFileName: (fileName) => fileName,
        getNewLine: () => "\n",
    };
}
function canonicalPath(fileName) {
    const resolved = path.resolve(fileName);
    return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
}
function isWithin(candidate, root) {
    const rel = path.relative(root, candidate);
    return rel === "" || (!rel.startsWith("..") && rel !== "." && !path.isAbsolute(rel));
}
function toRepoRelative(repoRoot, fileName) {
    return path.relative(repoRoot, fileName).replaceAll("\\", "/");
}
//# sourceMappingURL=affected.js.map