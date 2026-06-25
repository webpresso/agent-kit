import path from "node:path";
import ts from "typescript";
import { createCliLogSink } from "#cli/commands/quality-log-store.js";
export async function runAffectedTypecheck(options) {
    const repoRoot = path.resolve(options.repoRoot);
    const sink = createCliLogSink("typecheck", repoRoot);
    let plan;
    try {
        plan = planAffectedTypecheckClosure(options);
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
    sink.write(`Affected typecheck config: ${path.relative(repoRoot, plan.configPath) || plan.configPath}\n`);
    sink.write(`Affected typecheck changed files: ${plan.changedFiles.length}\n`);
    sink.write(`Affected typecheck reverse-dependency closure: ${plan.closureFiles.length}\n`);
    const diagnostics = collectAffectedDiagnostics(plan.program, plan.closureFiles);
    if (diagnostics.length > 0) {
        sink.write(formatDiagnostics(diagnostics, repoRoot, Boolean(options.pretty)));
    }
    const exitCode = diagnostics.length === 0 ? 0 : 1;
    const entry = await sink.finalize({
        exitCode,
        summary: exitCode === 0 ? "typecheck passed" : `typecheck failed (exit ${exitCode})`,
        options: {
            affected: true,
            files: [...options.files],
            checkedFiles: plan.closureFiles.map((file) => toRepoRelative(repoRoot, file.fileName)),
            resolvedScopes: ["affected-closure"],
        },
    });
    return {
        exitCode,
        entry,
        checkedFiles: plan.closureFiles.map((file) => toRepoRelative(repoRoot, file.fileName)),
    };
}
export function planAffectedTypecheckClosure(options) {
    const repoRoot = path.resolve(options.repoRoot);
    const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, "tsconfig.json");
    if (!configPath)
        throw new Error(`Unable to find tsconfig.json from ${repoRoot}`);
    const parsed = readTsConfig(configPath);
    const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        projectReferences: parsed.projectReferences,
    });
    const sourceFiles = program
        .getSourceFiles()
        .filter((sourceFile) => !sourceFile.isDeclarationFile && isWithin(sourceFile.fileName, repoRoot));
    const byCanonicalPath = new Map();
    for (const sourceFile of sourceFiles)
        byCanonicalPath.set(canonicalPath(sourceFile.fileName), sourceFile);
    const changedFiles = options.files
        .map((file) => path.resolve(repoRoot, file))
        .map((file) => byCanonicalPath.get(canonicalPath(file)))
        .filter((file) => file !== undefined);
    if (changedFiles.length === 0) {
        throw new Error("Affected typecheck found no changed files inside the active TypeScript program.");
    }
    const reverseDependencies = buildReverseDependencyGraph(program, sourceFiles, byCanonicalPath);
    const closure = collectReverseClosure(changedFiles, reverseDependencies);
    return {
        program,
        configPath,
        changedFiles,
        closureFiles: [...closure].sort((a, b) => a.fileName.localeCompare(b.fileName)),
    };
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
function collectAffectedDiagnostics(program, files) {
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