import { spawnSync } from "node:child_process";
const TITLE = "Blueprint PR coverage";
const BLUEPRINT_EXEMPT_PATTERN = /^Blueprint-exempt:\s*(\S.*)$/im;
export function auditBlueprintPrCoverage(rootDirectory = process.cwd(), options = {}) {
    const resolved = resolveChangedFiles(rootDirectory, options);
    if (resolved.warning) {
        return passWithWarning(resolved.warning, resolved.files.length);
    }
    const changedFiles = resolved.files.filter((file) => file.trim().length > 0);
    if (changedFiles.length === 0) {
        return passWithWarning("[warn] blueprint-pr-coverage skipped: no changed files detected", 0);
    }
    if (changedFiles.every(isMarkdownFile)) {
        return pass(changedFiles.length);
    }
    if (changedFiles.some(isBlueprintFile)) {
        return pass(changedFiles.length);
    }
    const exemption = findBlueprintExemption(rootDirectory, options);
    if (exemption) {
        return passWithWarning(`[warn] Blueprint-exempt trailer present: ${exemption}`, changedFiles.length);
    }
    return {
        ok: false,
        title: TITLE,
        checked: changedFiles.length,
        violations: [
            {
                message: "non-doc PR without a blueprint change — add/update blueprints/ coverage, or include a commit trailer `Blueprint-exempt: <reason>` for a genuinely trivial change",
            },
        ],
    };
}
function pass(checked) {
    return { ok: true, title: TITLE, checked, violations: [] };
}
function passWithWarning(message, checked) {
    return { ok: true, title: TITLE, checked, violations: [{ message }] };
}
function resolveChangedFiles(cwd, options) {
    if (options.changedFiles)
        return { files: options.changedFiles };
    const baseRef = options.baseRef?.trim();
    if (!baseRef) {
        return {
            files: [],
            warning: "[warn] blueprint-pr-coverage skipped: provide --base <ref> or changedFiles in PR contexts",
        };
    }
    if (!isGitHistoryAvailable(cwd)) {
        return {
            files: [],
            warning: "[warn] blueprint-pr-coverage skipped: git history unavailable",
        };
    }
    const result = spawnSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0 || result.error) {
        return {
            files: [],
            warning: `[warn] blueprint-pr-coverage skipped: unable to resolve changed files from ${baseRef}...HEAD`,
        };
    }
    return { files: splitLines(result.stdout) };
}
function findBlueprintExemption(cwd, options) {
    const messages = options.commitMessages ?? readCommitMessages(cwd, options.baseRef);
    for (const message of messages) {
        const match = BLUEPRINT_EXEMPT_PATTERN.exec(message);
        const reason = match?.[1]?.trim();
        if (reason)
            return reason;
    }
    return null;
}
function readCommitMessages(cwd, baseRef) {
    const base = baseRef?.trim();
    if (!base || !isGitHistoryAvailable(cwd))
        return [];
    const result = spawnSync("git", ["log", "--format=%B%x00", `${base}...HEAD`], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0 || result.error)
        return [];
    return result.stdout
        .split("\0")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function isGitHistoryAvailable(cwd) {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    return result.status === 0 && !result.error;
}
function isMarkdownFile(filePath) {
    return normalizePath(filePath).toLowerCase().endsWith(".md");
}
function isBlueprintFile(filePath) {
    return normalizePath(filePath).startsWith("blueprints/");
}
function normalizePath(filePath) {
    return filePath.replaceAll("\\", "/");
}
function splitLines(value) {
    return value
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
}
//# sourceMappingURL=blueprint-pr-coverage.js.map