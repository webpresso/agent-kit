import path from "node:path";

import ts from "typescript";

import { createCliLogSink } from "#cli/commands/quality-log-store.js";

export interface AffectedTypecheckOptions {
  readonly repoRoot: string;
  readonly files: readonly string[];
  readonly pretty?: boolean;
}

export interface AffectedTypecheckResult {
  readonly exitCode: number;
  readonly entry: import("#cli/commands/quality-log-store.js").CliLogEntry;
  readonly checkedFiles: readonly string[];
}

interface AffectedClosurePlan {
  readonly program: ts.Program;
  readonly configPath: string;
  readonly changedFiles: readonly ts.SourceFile[];
  readonly closureFiles: readonly ts.SourceFile[];
}

const NO_CHANGED_FILES_IN_PROGRAM =
  "Affected typecheck found no changed files inside the active TypeScript program.";

export async function runAffectedTypecheck(
  options: AffectedTypecheckOptions,
): Promise<AffectedTypecheckResult> {
  const repoRoot = path.resolve(options.repoRoot);
  const sink = createCliLogSink("typecheck", repoRoot);

  let plan: AffectedClosurePlan;
  try {
    plan = planAffectedTypecheckClosure(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sink.write(`${message}\n`);
    if (message === NO_CHANGED_FILES_IN_PROGRAM) {
      const entry = await sink.finalize({
        exitCode: 0,
        summary: "typecheck passed",
        options: {
          affected: true,
          files: [...options.files],
          checkedFiles: [],
          resolvedScopes: ["affected-closure"],
        },
      });
      return { exitCode: 0, entry, checkedFiles: [] };
    }

    const entry = await sink.finalize({
      exitCode: 1,
      summary: "typecheck failed: affected closure unavailable",
      options: { affected: true, files: [...options.files] },
    });
    return { exitCode: 1, entry, checkedFiles: [] };
  }

  sink.write(
    `Affected typecheck config: ${path.relative(repoRoot, plan.configPath) || plan.configPath}\n`,
  );
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

export function planAffectedTypecheckClosure(
  options: AffectedTypecheckOptions,
): AffectedClosurePlan {
  const repoRoot = path.resolve(options.repoRoot);
  const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error(`Unable to find tsconfig.json from ${repoRoot}`);

  const parsed = readTsConfig(configPath);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });

  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (sourceFile) => !sourceFile.isDeclarationFile && isWithin(sourceFile.fileName, repoRoot),
    );
  const byCanonicalPath = new Map<string, ts.SourceFile>();
  for (const sourceFile of sourceFiles)
    byCanonicalPath.set(canonicalPath(sourceFile.fileName), sourceFile);

  const changedFiles = options.files
    .map((file) => path.resolve(repoRoot, file))
    .map((file) => byCanonicalPath.get(canonicalPath(file)))
    .filter((file): file is ts.SourceFile => file !== undefined);
  if (changedFiles.length === 0) {
    throw new Error(NO_CHANGED_FILES_IN_PROGRAM);
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

function readTsConfig(configPath: string): ts.ParsedCommandLine {
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnostics(parsed.errors, diagnosticFormatHost(path.dirname(configPath))),
    );
  }
  return parsed;
}

function buildReverseDependencyGraph(
  program: ts.Program,
  sourceFiles: readonly ts.SourceFile[],
  byCanonicalPath: ReadonlyMap<string, ts.SourceFile>,
): Map<ts.SourceFile, Set<ts.SourceFile>> {
  const reverse = new Map<ts.SourceFile, Set<ts.SourceFile>>();
  const options = program.getCompilerOptions();
  const host = ts.createCompilerHost(options, true);

  for (const sourceFile of sourceFiles) {
    for (const specifier of getModuleSpecifiers(sourceFile)) {
      const resolved = ts.resolveModuleName(
        specifier,
        sourceFile.fileName,
        options,
        host,
      ).resolvedModule;
      if (!resolved) continue;
      const imported = byCanonicalPath.get(canonicalPath(resolved.resolvedFileName));
      if (!imported) continue;
      const importers = reverse.get(imported) ?? new Set<ts.SourceFile>();
      importers.add(sourceFile);
      reverse.set(imported, importers);
    }
  }

  return reverse;
}

function getModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function collectReverseClosure(
  changedFiles: readonly ts.SourceFile[],
  reverseDependencies: ReadonlyMap<ts.SourceFile, ReadonlySet<ts.SourceFile>>,
): Set<ts.SourceFile> {
  const closure = new Set<ts.SourceFile>();
  const queue = [...changedFiles];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || closure.has(current)) continue;
    closure.add(current);
    for (const importer of reverseDependencies.get(current) ?? []) queue.push(importer);
  }
  return closure;
}

function collectAffectedDiagnostics(
  program: ts.Program,
  files: readonly ts.SourceFile[],
): readonly ts.Diagnostic[] {
  const diagnostics: ts.Diagnostic[] = [];
  diagnostics.push(...program.getOptionsDiagnostics());
  diagnostics.push(...program.getGlobalDiagnostics());
  for (const file of files) {
    diagnostics.push(...program.getSyntacticDiagnostics(file));
    diagnostics.push(...program.getSemanticDiagnostics(file));
  }
  return diagnostics;
}

function formatDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  repoRoot: string,
  pretty: boolean,
): string {
  const host = diagnosticFormatHost(repoRoot);
  return pretty
    ? ts.formatDiagnosticsWithColorAndContext(diagnostics, host)
    : ts.formatDiagnostics(diagnostics, host);
}

function diagnosticFormatHost(repoRoot: string): ts.FormatDiagnosticsHost {
  return {
    getCurrentDirectory: () => repoRoot,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => "\n",
  };
}

function canonicalPath(fileName: string): string {
  const resolved = path.resolve(fileName);
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
}

function isWithin(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && rel !== "." && !path.isAbsolute(rel));
}

function toRepoRelative(repoRoot: string, fileName: string): string {
  return path.relative(repoRoot, fileName).replaceAll("\\", "/");
}
