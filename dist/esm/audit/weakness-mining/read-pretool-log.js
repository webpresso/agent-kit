import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseLogLine } from '#hooks/pretool-guard/logger';
const DEFAULT_CANDIDATE_FILES = [
    '.agent/logs/pretool-guard.log',
    '.omx/state/hooks/worktree/pretool-guard.log',
    '.omx/hooks/worktree/pretool-guard.log',
];
export function readPretoolEvidence(rootDirectory = process.cwd(), options = {}) {
    const root = resolve(rootDirectory);
    const maxFiles = options.maxFiles ?? 24;
    const maxBytesPerFile = options.maxBytesPerFile ?? 512_000;
    const maxDirectories = options.maxDirectories ?? 256;
    const maxDepth = options.maxDepth ?? 8;
    const collected = collectCandidateFiles(root, options.logFiles, {
        maxFiles,
        maxDirectories,
        maxDepth,
    });
    const candidateFiles = collected.candidateFiles;
    const warnings = [...collected.warnings];
    const records = [];
    for (const candidate of candidateFiles) {
        const absolutePath = resolve(root, candidate);
        let stat;
        try {
            stat = statSync(absolutePath);
        }
        catch {
            continue;
        }
        if (!stat.isFile())
            continue;
        if (stat.size > maxBytesPerFile) {
            warnings.push(`${candidate} skipped: ${stat.size} bytes exceeds ${maxBytesPerFile}`);
            continue;
        }
        const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/u);
        for (const [index, line] of lines.entries()) {
            if (!line.trim())
                continue;
            const parsed = parseLogLine(line);
            if (!parsed) {
                warnings.push(`${candidate}:${index + 1} ignored: not a pretool log record`);
                continue;
            }
            records.push({ ...parsed, sourceFile: candidate, lineNumber: index + 1 });
        }
    }
    return { records, candidateFiles, warnings };
}
function collectCandidateFiles(root, explicitFiles, limits) {
    if (explicitFiles && explicitFiles.length > 0)
        return { candidateFiles: explicitFiles.map((file) => normalize(root, file)), warnings: [] };
    const candidates = new Set();
    const warnings = [];
    for (const file of DEFAULT_CANDIDATE_FILES)
        candidates.add(file);
    const envLogDir = process.env.PRETOOL_LOG_DIR;
    if (envLogDir)
        candidates.add(normalize(root, join(envLogDir, 'pretool-guard.log')));
    for (const rootRelativeDir of ['.omx/state', '.omx/runtime', 'logs']) {
        const found = findNamedFiles(resolve(root, rootRelativeDir), 'pretool-guard.log', limits);
        warnings.push(...found.warnings);
        for (const file of found.files) {
            candidates.add(normalize(root, file));
            if (candidates.size >= limits.maxFiles)
                return { candidateFiles: [...candidates], warnings };
        }
    }
    return { candidateFiles: [...candidates], warnings };
}
function findNamedFiles(startDir, fileName, limits) {
    const files = [];
    const warnings = [];
    const stack = [{ path: startDir, depth: 0 }];
    let visitedDirectories = 0;
    let depthWarningEmitted = false;
    while (stack.length > 0 && files.length < limits.maxFiles) {
        if (visitedDirectories >= limits.maxDirectories) {
            warnings.push(`${startDir} search stopped after ${limits.maxDirectories} directories`);
            break;
        }
        const current = stack.pop();
        if (!current || !existsSync(current.path))
            continue;
        visitedDirectories += 1;
        let entries;
        try {
            entries = readdirSync(current.path, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = join(current.path, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git')
                    continue;
                if (current.depth >= limits.maxDepth) {
                    if (!depthWarningEmitted) {
                        warnings.push(`${startDir} search stopped at depth ${limits.maxDepth}`);
                        depthWarningEmitted = true;
                    }
                    continue;
                }
                stack.push({ path: fullPath, depth: current.depth + 1 });
            }
            else if (entry.isFile() && entry.name === fileName) {
                files.push(fullPath);
                if (files.length >= limits.maxFiles)
                    break;
            }
        }
    }
    return { files, warnings };
}
function normalize(root, filePath) {
    const absolute = resolve(root, filePath);
    const rel = relative(root, absolute);
    return rel.startsWith('..') ? absolute : rel;
}
//# sourceMappingURL=read-pretool-log.js.map