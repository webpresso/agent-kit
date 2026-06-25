import { execFileSync } from "node:child_process";
export function defaultBranchBaseRef(env = process.env) {
    return `origin/${env.GITHUB_BASE_REF ?? "main"}`;
}
export function getGitTopLevel(cwd = process.cwd()) {
    try {
        const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return output.length > 0 ? output : null;
    }
    catch {
        return null;
    }
}
export function getStagedFiles(cwd = process.cwd()) {
    const repoProbe = probeGitRepo(cwd);
    if (repoProbe !== true)
        return repoProbe;
    return readChangedFiles(cwd, ["diff", "-z", "--cached", "--name-only", "--diff-filter=ACMR"]);
}
export function getBranchChangedFiles(cwd = process.cwd(), base = defaultBranchBaseRef()) {
    const repoProbe = probeGitRepo(cwd);
    if (repoProbe !== true)
        return repoProbe;
    const refProbe = probeRefExists(cwd, base);
    if (refProbe !== true)
        return refProbe;
    return readChangedFiles(cwd, [
        "diff",
        "-z",
        "--name-only",
        "--diff-filter=ACMR",
        `${base}...HEAD`,
    ]);
}
function probeGitRepo(cwd) {
    try {
        const output = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return output === "true" ? true : { files: [], degraded: true, reason: "not-a-repo" };
    }
    catch (error) {
        return {
            files: [],
            degraded: true,
            reason: isGitUnavailableError(error) ? "git-unavailable" : "not-a-repo",
        };
    }
}
function probeRefExists(cwd, ref) {
    try {
        execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
            cwd,
            stdio: ["ignore", "ignore", "ignore"],
        });
        return true;
    }
    catch (error) {
        return {
            files: [],
            degraded: true,
            reason: isGitUnavailableError(error) ? "git-unavailable" : "missing-base-ref",
        };
    }
}
function readChangedFiles(cwd, args) {
    try {
        const raw = execFileSync("git", args, {
            cwd,
            stdio: ["ignore", "pipe", "ignore"],
        });
        const parsed = parseNullDelimitedPaths(raw);
        const files = excludeSubmodulePaths(cwd, parsed);
        return {
            files,
            degraded: false,
            reason: files.length === 0 ? "empty" : "ok",
        };
    }
    catch (error) {
        return {
            files: [],
            degraded: true,
            reason: isGitUnavailableError(error) ? "git-unavailable" : "git-error",
        };
    }
}
function parseNullDelimitedPaths(raw) {
    const values = raw
        .toString("utf8")
        .split("\0")
        .filter((value) => value.length > 0);
    return [...new Set(values)];
}
function excludeSubmodulePaths(cwd, files) {
    if (files.length === 0)
        return [];
    try {
        const submodulePaths = new Set();
        for (const chunk of chunkFiles(files, 500)) {
            const output = execFileSync("git", ["ls-files", "--stage", "-z", "--", ...chunk], {
                cwd,
                stdio: ["ignore", "pipe", "ignore"],
            });
            collectSubmodulePaths(output, submodulePaths);
        }
        return files.filter((file) => !submodulePaths.has(file));
    }
    catch {
        return [...files];
    }
}
function collectSubmodulePaths(raw, target) {
    for (const record of raw.toString("utf8").split("\0")) {
        if (record.length === 0)
            continue;
        const tabIndex = record.indexOf("\t");
        if (tabIndex === -1)
            continue;
        const metadata = record.slice(0, tabIndex);
        const path = record.slice(tabIndex + 1);
        const [mode] = metadata.split(" ", 1);
        if (mode === "160000")
            target.add(path);
    }
}
function chunkFiles(files, size) {
    const chunks = [];
    for (let index = 0; index < files.length; index += size) {
        chunks.push(files.slice(index, index + size));
    }
    return chunks;
}
function isGitUnavailableError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT");
}
//# sourceMappingURL=changed-files.js.map