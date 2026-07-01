/**
 * Blueprint DB Parser
 *
 * Extracts structured data from blueprint `_overview.md` files for DB projection.
 * This is SEPARATE from `src/blueprint/core/parser.ts` which serves the CLI/runtime layer.
 *
 * Design: fault-tolerant — malformed YAML or missing sections log to stderr and return
 * partial data rather than throwing. Callers should check required fields before ingesting.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
// ---------------------------------------------------------------------------
// Workflow skill names — treated as plain text, no validation needed.
// These appear in acceptance criteria lines and must parse cleanly.
// ---------------------------------------------------------------------------
const _WORKFLOW_SKILL_PATTERN = /\/(?:qa|qa-only|design-review|investigate|review|browse|autoplan|plan-eng-review|plan-ceo-review|plan-design-review|devex-review|plan-devex-review|health|claude)/g;
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const organizationByGitRoot = new Map();
function findGitRoot(startPath) {
    let dir = path.dirname(startPath);
    while (true) {
        if (existsSync(path.join(dir, ".git")))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
function organizationFromRemote(remote) {
    const match = remote.match(/[:/]([^/]+)\/[^/]+(?:\.git)?$/);
    return match?.[1] ?? null;
}
function readGitDirFromFile(dotGitPath) {
    try {
        const gitFile = readFileSync(dotGitPath, "utf8");
        const match = gitFile.match(/^gitdir:\s*(.+)$/m);
        if (!match?.[1])
            return null;
        const gitDir = match[1].trim();
        return path.isAbsolute(gitDir)
            ? path.normalize(gitDir)
            : path.resolve(path.dirname(dotGitPath), gitDir);
    }
    catch {
        return null;
    }
}
function resolveCommonGitDir(gitDir) {
    try {
        const commonDir = readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
        if (commonDir.length === 0)
            return gitDir;
        return path.isAbsolute(commonDir) ? path.normalize(commonDir) : path.resolve(gitDir, commonDir);
    }
    catch {
        return gitDir;
    }
}
function remoteOriginUrlFromConfig(config) {
    let inOriginRemote = false;
    for (const rawLine of config.split("\n")) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith("#") || line.startsWith(";"))
            continue;
        const sectionMatch = line.match(/^\[(.+)]$/);
        if (sectionMatch?.[1]) {
            inOriginRemote = sectionMatch[1] === 'remote "origin"';
            continue;
        }
        if (!inOriginRemote)
            continue;
        const urlMatch = line.match(/^url\s*=\s*(.+)$/);
        if (urlMatch?.[1])
            return urlMatch[1].trim();
    }
    return null;
}
function readRemoteOriginFromGitConfig(gitRoot) {
    const dotGitPath = path.join(gitRoot, ".git");
    const directConfigPath = path.join(dotGitPath, "config");
    let configPath = existsSync(directConfigPath) ? directConfigPath : null;
    if (!configPath) {
        const gitDir = readGitDirFromFile(dotGitPath);
        if (gitDir) {
            configPath = path.join(resolveCommonGitDir(gitDir), "config");
        }
    }
    if (!configPath || !existsSync(configPath))
        return { configRead: false, remote: null };
    try {
        return {
            configRead: true,
            remote: remoteOriginUrlFromConfig(readFileSync(configPath, "utf8")),
        };
    }
    catch {
        return { configRead: false, remote: null };
    }
}
function safeString(value) {
    if (value === null || value === undefined)
        return null;
    if (value instanceof Date)
        return value.toISOString().split("T")[0] ?? null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
}
function safeStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === "string" && v.trim().length > 0);
}
/** Detect org from git remote URL, caching once per repo root. */
function detectOrganization(filePath) {
    const gitRoot = findGitRoot(filePath);
    if (!gitRoot)
        return "unknown";
    const cached = organizationByGitRoot.get(gitRoot);
    if (cached)
        return cached;
    let organization = "unknown";
    const configRemote = readRemoteOriginFromGitConfig(gitRoot);
    if (configRemote.configRead) {
        organization = configRemote.remote
            ? (organizationFromRemote(configRemote.remote) ?? "unknown")
            : "unknown";
    }
    else {
        try {
            const remote = execSync("git config --get remote.origin.url", {
                cwd: gitRoot,
                stdio: ["ignore", "pipe", "ignore"],
                encoding: "utf8",
                timeout: 500,
            }).trim();
            organization = organizationFromRemote(remote) ?? "unknown";
        }
        catch {
            // Silently fall through — not all environments have git remotes. Cache the
            // miss so bulk blueprint ingestion remains bounded in non-git fixtures.
        }
    }
    organizationByGitRoot.set(gitRoot, organization);
    return organization;
}
/** Determine visibility from frontmatter or filepath convention. Defaults to private. */
function detectVisibility(frontmatter, filePath) {
    const fm = frontmatter;
    if (typeof fm["visibility"] === "string") {
        return fm["visibility"] === "public" ? "public" : "private";
    }
    // If the file lives under a path segment named 'public', treat as public
    if (filePath.includes("/public/"))
        return "public";
    return "private";
}
/** Parse cross_repo_depends_on array from frontmatter. */
function parseCrossRepoDeps(value) {
    if (!Array.isArray(value))
        return [];
    const result = [];
    for (const item of value) {
        if (typeof item === "string") {
            result.push({ repo: item, slug: null, requireStatus: null });
        }
        else if (item !== null && typeof item === "object") {
            const obj = item;
            result.push({
                repo: typeof obj["repo"] === "string" ? obj["repo"] : String(obj["repo"] ?? ""),
                slug: typeof obj["slug"] === "string" ? obj["slug"] : null,
                requireStatus: typeof obj["require_status"] === "string" ? obj["require_status"] : null,
            });
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Task parsing
// ---------------------------------------------------------------------------
/** Map raw status text to the canonical DB enum. */
function normalizeTaskStatus(raw) {
    const lower = raw.toLowerCase().trim();
    if (lower === "done")
        return "done";
    if (lower === "in-progress" || lower === "in_progress")
        return "in-progress";
    if (lower === "blocked")
        return "blocked";
    if (lower === "dropped")
        return "dropped";
    return "todo";
}
/** Derive task status from checkbox coverage when no explicit **Status:** line exists. */
function deriveStatusFromCheckboxes(body) {
    const checkboxes = Array.from(body.matchAll(/^- \[([ x])\]/gm));
    if (checkboxes.length === 0)
        return "todo";
    const checked = checkboxes.filter((m) => m[1] === "x").length;
    if (checked === checkboxes.length)
        return "done";
    if (checked > 0)
        return "in-progress";
    return "todo";
}
/** Extract acceptance criteria lines (- [ ] and - [x]) from a task body.
 *  Workflow skill names in these lines are treated as plain text — no warning emitted. */
function extractAcceptanceCriteria(body) {
    const lines = [];
    for (const line of body.split("\n")) {
        if (/^- \[[ x]\]/.test(line)) {
            // Strip the workflow skill tokens so they pass through without any external validation.
            // We intentionally keep the full original line — the regex match just confirms it's a
            // valid checklist item; the workflow skill names are plain text and need no processing.
            lines.push(line.trim());
        }
    }
    return lines;
}
/** Extract "**Depends:** Task X.Y, Task A.B" → ['X.Y', 'A.B'] */
function extractDependsOnTaskIds(body) {
    const match = body.match(/\*\*Depends:\*\*\s*(.+)/i);
    if (!match?.[1])
        return [];
    const text = match[1].trim();
    if (text.toLowerCase() === "none")
        return [];
    return Array.from(text.matchAll(/(?:Tasks?\s+)?(\d+(?:\.\d+)+)/gi), (m) => m[1] ?? "").filter((id) => id !== "");
}
/** Parse file entries from a task body. Supports:
 *  - `create src/foo.ts` / `modify src/foo.ts` / `delete src/foo.ts`
 *  - bare file paths inferred as 'modify'
 */
function extractTaskFiles(body) {
    const results = [];
    const opPattern = /^[-*]\s+(create|modify|delete)\s+([^\s]+\.[a-z]{1,5})/gim;
    for (const m of body.matchAll(opPattern)) {
        results.push({
            op: (m[1]?.toLowerCase() ?? "modify"),
            filePath: m[2] ?? "",
        });
    }
    return results;
}
/** Extract description text: lines after the task header that are not metadata/checkboxes. */
function extractTaskDescription(body) {
    const lines = body.split("\n");
    const descLines = [];
    let pastHeader = false;
    for (const line of lines) {
        // Skip the task header line itself
        if (/^####\s+.*Task\s+\d/.test(line)) {
            pastHeader = true;
            continue;
        }
        if (!pastHeader)
            continue;
        // Skip metadata lines
        if (/^\*\*(Status|Depends|Blocked|Wave):\*\*/i.test(line))
            continue;
        // Skip checkbox lines
        if (/^- \[[ x]\]/.test(line))
            continue;
        // Skip sub-section headers
        if (/^#{2,5}\s/.test(line))
            continue;
        // Collect up to first blank line after non-blank content
        if (line.trim() === "") {
            if (descLines.length > 0)
                break;
            continue;
        }
        descLines.push(line.trim());
    }
    const desc = descLines.join(" ").trim();
    return desc.length > 0 ? desc : null;
}
/** Parse the wave tag from the task header, e.g. `[Wave 1]` → '1'. */
function extractWaveFromHeader(header) {
    const m = header.match(/\[Wave\s+(\S+)\]/i);
    return m?.[1] ?? null;
}
function parseTasks(content) {
    const taskHeaderRegex = /^(####\s+(?:\[[^\]]+\]\s+)?Task\s+(\d+(?:\.\d+)+):\s*(.+))$/gm;
    const headerMatches = Array.from(content.matchAll(taskHeaderRegex));
    return headerMatches.map((match, idx) => {
        const taskId = match[2] ?? "";
        const title = (match[3] ?? "").trim();
        const headerLine = match[1] ?? "";
        const wave = extractWaveFromHeader(headerLine);
        const bodyStart = (match.index ?? 0) + headerLine.length;
        const bodyEnd = headerMatches[idx + 1]?.index ?? content.length;
        const body = content.slice(bodyStart, bodyEnd);
        const explicitStatusMatch = body.match(/\*\*Status:\*\*\s*(.+)/i);
        const status = explicitStatusMatch?.[1]
            ? normalizeTaskStatus(explicitStatusMatch[1])
            : deriveStatusFromCheckboxes(body);
        return {
            taskId,
            wave,
            title,
            status,
            description: extractTaskDescription(match[0] + body),
            acceptanceCriteria: extractAcceptanceCriteria(body),
            dependsOnTaskIds: extractDependsOnTaskIds(body),
            files: extractTaskFiles(body),
        };
    });
}
// ---------------------------------------------------------------------------
// Risks parsing
// ---------------------------------------------------------------------------
/**
 * Parse the Risks table. Expected format:
 * | R1 | HIGH | description | mitigation |
 */
function parseRisks(content) {
    const section = extractSection(content, "Risks");
    if (!section)
        return [];
    const rows = extractTableRows(section);
    const risks = [];
    for (const cells of rows) {
        if (cells.length < 4)
            continue;
        const riskId = (cells[0] ?? "").trim();
        const severityRaw = (cells[1] ?? "").trim().toUpperCase();
        // Guard: skip header rows
        if (riskId.toLowerCase() === "#" || riskId.toLowerCase() === "risk")
            continue;
        const severity = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(severityRaw)
            ? severityRaw
            : "LOW";
        risks.push({
            riskId,
            severity,
            description: (cells[2] ?? "").trim(),
            mitigation: (cells[3] ?? "").trim(),
        });
    }
    return risks;
}
// ---------------------------------------------------------------------------
// Edge cases parsing
// ---------------------------------------------------------------------------
/**
 * Parse the Edge cases/Edge Cases table. Expected format:
 * | E1 | scenario | handling | task |
 * The severity column is optional (some blueprints omit it).
 */
function parseEdgeCases(content) {
    const section = extractSection(content, "Edge [Cc]ases?");
    if (!section)
        return [];
    const rows = extractTableRows(section);
    const edges = [];
    for (const cells of rows) {
        if (cells.length < 3)
            continue;
        const edgeId = (cells[0] ?? "").trim();
        // Skip header rows
        if (edgeId.toLowerCase() === "#" || edgeId.toLowerCase() === "edge")
            continue;
        // Some tables: | E1 | severity | desc | mitigation |
        // Others:      | E1 | desc | handling | task |
        // Heuristic: if cell[1] looks like a severity keyword, use 4-col layout
        const col1 = (cells[1] ?? "").trim().toLowerCase();
        const isSeverityCol = col1 === "critical" || col1 === "high" || col1 === "medium" || col1 === "low";
        if (isSeverityCol && cells.length >= 4) {
            edges.push({
                edgeId,
                severity: (cells[1] ?? "").trim().toUpperCase(),
                description: (cells[2] ?? "").trim(),
                mitigation: (cells[3] ?? "").trim(),
            });
        }
        else {
            edges.push({
                edgeId,
                severity: "UNKNOWN",
                description: (cells[1] ?? "").trim(),
                mitigation: (cells[2] ?? "").trim(),
            });
        }
    }
    return edges;
}
// ---------------------------------------------------------------------------
// Shared table / section utilities
// ---------------------------------------------------------------------------
/** Extract the text under a named ## section up to the next ## heading. */
function extractSection(content, headingPattern) {
    const regex = new RegExp(`^## ${headingPattern}\\s*$`, "im");
    const match = content.match(regex);
    if (!match || match.index === undefined)
        return null;
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    const nextHeading = rest.search(/^## /m);
    return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}
/** Parse all data rows from a markdown table block (skip separator rows). */
function extractTableRows(block) {
    const rows = [];
    for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|"))
            continue;
        // Skip separator rows like | --- | --- |
        if (/^\|[-| :]+\|$/.test(trimmed))
            continue;
        const cells = trimmed
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());
        if (cells.length > 0)
            rows.push(cells);
    }
    return rows;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse a blueprint `_overview.md` for DB projection.
 *
 * Fault-tolerant: malformed YAML or missing sections log to stderr and return
 * partial data; this function never throws.
 */
export function parseBlueprintForDb(content, filePath, slug) {
    const byteSize = Buffer.byteLength(content, "utf8");
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    let frontmatter = {};
    let bodyContent = content;
    try {
        const parsed = matter(content);
        frontmatter = parsed.data;
        bodyContent = parsed.content;
    }
    catch (err) {
        process.stderr.write(`[blueprint-db-parser] Failed to parse frontmatter in ${filePath}: ${String(err)}\n`);
    }
    // Extract title from first # heading in body, fall back to frontmatter, then slug
    const titleMatch = bodyContent.match(/^# (.+)$/m);
    const title = safeString(frontmatter["title"]) ?? titleMatch?.[1]?.trim() ?? slug;
    const status = safeString(frontmatter["status"]) ?? "draft";
    const complexity = safeString(frontmatter["complexity"]);
    const owner = safeString(frontmatter["owner"]);
    const created = safeString(frontmatter["created"]);
    const lastUpdated = safeString(frontmatter["last_updated"]);
    const completedAt = safeString(frontmatter["completed_at"]);
    const tags = safeStringArray(frontmatter["tags"]);
    const dependsOn = safeStringArray(frontmatter["depends_on"]);
    const crossRepoDependsOn = parseCrossRepoDeps(frontmatter["cross_repo_depends_on"]);
    const organization = detectOrganization(filePath);
    const visibility = detectVisibility(frontmatter, filePath);
    let tasks = [];
    let risks = [];
    let edgeCases = [];
    try {
        tasks = parseTasks(bodyContent);
    }
    catch (err) {
        process.stderr.write(`[blueprint-db-parser] Failed to parse tasks in ${filePath}: ${String(err)}\n`);
    }
    try {
        risks = parseRisks(bodyContent);
    }
    catch (err) {
        process.stderr.write(`[blueprint-db-parser] Failed to parse risks in ${filePath}: ${String(err)}\n`);
    }
    try {
        edgeCases = parseEdgeCases(bodyContent);
    }
    catch (err) {
        process.stderr.write(`[blueprint-db-parser] Failed to parse edge cases in ${filePath}: ${String(err)}\n`);
    }
    return {
        slug,
        filePath,
        title,
        status,
        complexity,
        owner,
        created,
        lastUpdated,
        completedAt,
        tags,
        dependsOn,
        crossRepoDependsOn,
        organization,
        visibility,
        tasks,
        risks,
        edgeCases,
        byteSize,
        contentHash,
    };
}
//# sourceMappingURL=blueprint-db-parser.js.map