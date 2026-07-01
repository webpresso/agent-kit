/**
 * Blueprint Parser
 *
 * Blueprint parser/types are owned locally so the package can keep its
 * schema contract and parsing behavior self-contained.
 */
import matter from "gray-matter";
import { planFrontmatterSchema, taskStatusSchema } from "#core/schema";
function parseWithSchema(markdown, schema) {
    const { data: rawData, content } = matter(markdown);
    const data = schema.parse(rawData);
    return { data, content };
}
export function parseBlueprint(markdown, name) {
    const { data, content } = parseWithSchema(markdown, planFrontmatterSchema);
    const titleMatch = content.match(/^# (.+)$/m);
    const title = data.title ?? titleMatch?.[1]?.trim() ?? name;
    const lastUpdated = data.last_updated instanceof Date
        ? (data.last_updated.toISOString().split("T")[0] ?? "")
        : String(data.last_updated ?? "");
    const created = data.created instanceof Date
        ? (data.created.toISOString().split("T")[0] ?? "")
        : data.created
            ? String(data.created)
            : undefined;
    const completedAt = data.completed_at instanceof Date
        ? (data.completed_at.toISOString().split("T")[0] ?? "")
        : data.completed_at
            ? String(data.completed_at)
            : undefined;
    const tasks = extractTasks(content);
    assertExplicitTaskStatuses(tasks, data.status, name);
    const phases = extractPhases(content, tasks);
    return {
        name,
        type: data.type,
        title,
        status: data.status,
        complexity: data.complexity,
        description: data.description ?? tasks[0]?.description,
        lastUpdated,
        ...(created && { created }),
        ...(typeof data.progress === "string" && data.progress.trim() && { progress: data.progress }),
        ...(completedAt && { completedAt }),
        ...(data.worktree_owner_id && { worktreeOwnerId: data.worktree_owner_id }),
        ...(data.worktree_owner_branch && { worktreeOwnerBranch: data.worktree_owner_branch }),
        ...(typeof data.parent_roadmap === "string" &&
            data.parent_roadmap.trim() && { parentRoadmap: data.parent_roadmap.trim() }),
        ...(data.depends_on && data.depends_on.length > 0 && { dependsOn: data.depends_on }),
        ...(data.tags && data.tags.length > 0 && { tags: data.tags }),
        tasks,
        phases,
        raw: markdown,
    };
}
export function serializeBlueprint(blueprint) {
    const { data, content } = matter(blueprint.raw);
    if (blueprint.status)
        data.status = blueprint.status;
    if (blueprint.complexity)
        data.complexity = blueprint.complexity;
    if (blueprint.lastUpdated)
        data.last_updated = blueprint.lastUpdated;
    if (blueprint.progress) {
        data.progress = blueprint.progress;
    }
    else {
        delete data.progress;
    }
    if (blueprint.completedAt) {
        data.completed_at = blueprint.completedAt;
    }
    else {
        delete data.completed_at;
    }
    const { tasks: _tasks, task_statuses: _task_statuses, ...cleanedData } = data;
    return quoteGeneratedProgressScalar(matter.stringify(content, cleanedData), blueprint.progress);
}
function quoteGeneratedProgressScalar(serialized, progress) {
    if (!progress)
        return serialized;
    const escaped = progress.replace(/'/g, "''");
    return serialized.replace(/^progress: .+$/m, `progress: '${escaped}'`);
}
function extractCheckboxStatus(section) {
    const checkboxRegex = /^- \[([ x])\]/gm;
    const matches = Array.from(section.matchAll(checkboxRegex));
    const total = matches.length;
    const checked = matches.filter((m) => m[1] === "x").length;
    let status = "todo";
    if (total > 0) {
        if (checked === total) {
            status = "done";
        }
        else if (checked > 0) {
            status = "in-progress";
        }
    }
    return {
        status,
        acceptanceCriteria: { total, checked },
    };
}
function extractExplicitTaskStatus(section) {
    const statusMatch = section.match(/\*\*Status:\*\*\s*(.+)/i);
    if (!statusMatch?.[1])
        return undefined;
    const rawStatus = statusMatch[1].trim();
    const normalizedStatus = extractInlineMetadataValue(rawStatus).replace(/\bin_progress\b/gi, "in-progress");
    const parsed = taskStatusSchema.safeParse(normalizedStatus);
    if (!parsed.success) {
        throw new Error(`Invalid task status "${rawStatus}". Valid statuses: ${taskStatusSchema.options.join(", ")}`);
    }
    return parsed.data;
}
function extractInlineMetadataValue(rawValue) {
    return (rawValue
        .trim()
        .split(/\s*\|\s*|\s+(?=\*\*(?:Status|Depends|Blocked|Wave|Files|Acceptance):\*\*)/i)[0]
        ?.trim() ?? "");
}
function findTaskSectionEnd(content, taskStart, nextTaskIndex) {
    const contentAfterTask = content.slice(taskStart);
    const sectionDelimiterMatch = contentAfterTask.match(/\n(?:##\s|---\n)/);
    const sectionDelimiterIndex = sectionDelimiterMatch
        ? taskStart + (sectionDelimiterMatch.index ?? content.length) + 1
        : content.length;
    return Math.min(nextTaskIndex, sectionDelimiterIndex);
}
function validateTaskFormat(content) {
    const wrongFormat = content.match(/^###\s+(?:\[[^\]]+\]\s+)?Task\s+\d+(?:\.\d+)+:/gm);
    if (wrongFormat && wrongFormat.length > 0) {
        throw new Error(`Plan parsing failed: Found ${wrongFormat.length} task(s) using '### Task' (3 hashes). ` +
            `BLUEPRINT plans require '#### Task' (4 hashes). ` +
            `See docs/templates/blueprint.md for correct format.`);
    }
}
function extractTasks(content) {
    const taskRegex = /^####\s+(?:\[[^\]]+\]\s+)?Task\s+(\d+(?:\.\d+)+):\s*(.+)$/gm;
    const matches = Array.from(content.matchAll(taskRegex));
    validateTaskFormat(content);
    return matches.map((match, index) => {
        const id = match[1] ?? "";
        const taskStart = match.index ?? 0;
        const nextTaskIndex = matches[index + 1]?.index ?? content.length;
        const taskEnd = findTaskSectionEnd(content, taskStart, nextTaskIndex);
        const taskSection = content.slice(taskStart, taskEnd);
        const depends = extractDepends(taskSection);
        const blockedReason = extractBlocked(taskSection);
        const derived = extractCheckboxStatus(taskSection);
        const explicitStatus = extractExplicitTaskStatus(taskSection);
        const description = extractTaskDescription(taskSection);
        return Object.assign({
            id,
            title: (match[2] ?? "").trim(),
            status: explicitStatus ?? derived.status,
            acceptanceCriteria: derived.acceptanceCriteria,
        }, explicitStatus && { statusExplicit: true }, depends.length > 0 && { depends }, blockedReason && { blockedReason }, description && { description }, { stepType: inferTaskType(description || (match[2] ?? "")) }, extractTaskMetadata(description || (match[2] ?? "")), extractComplexity(description || ""));
    });
}
function requiresExplicitTaskStatus(blueprintStatus) {
    return (blueprintStatus === "draft" ||
        blueprintStatus === "planned" ||
        blueprintStatus === "parked" ||
        blueprintStatus === "in-progress");
}
function assertExplicitTaskStatuses(tasks, blueprintStatus, blueprintName) {
    if (!requiresExplicitTaskStatus(blueprintStatus)) {
        return;
    }
    const missing = tasks.filter((task) => !task.statusExplicit).map((task) => task.id);
    if (missing.length > 0) {
        throw new Error(`Blueprint ${blueprintName} requires explicit **Status:** on every task. Missing: ${missing.join(", ")}`);
    }
}
const TASK_TYPE_RULES = [
    { keywords: ["lint", "biome"], type: "lint-fix" },
    { keywords: ["type", "tsc", "tsgo"], type: "typecheck-fix" },
    { keywords: ["test", "vitest"], type: "test-fix" },
    { keywords: ["research", "investigate"], type: "research" },
    { keywords: ["verify", "check"], type: "verify" },
];
function inferTaskType(desc) {
    const lower = desc.toLowerCase();
    for (const rule of TASK_TYPE_RULES) {
        if (rule.keywords.some((kw) => lower.includes(kw))) {
            return rule.type;
        }
    }
    return "implement";
}
function extractTaskMetadata(desc) {
    const result = {};
    const pkgPatterns = [
        /\bin\s+(?:@webpresso\/)?(\w[\w-]*)/i,
        /\bfor\s+(?:@webpresso\/)?(\w[\w-]*)/i,
        /@webpresso\/([\w-]+)/,
    ];
    for (const pattern of pkgPatterns) {
        const match = desc.match(pattern);
        if (match) {
            result.targetPackage = match[1];
            break;
        }
    }
    const filePattern = /\b([\w/.-]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml))\b/;
    const fileMatch = desc.match(filePattern);
    if (fileMatch) {
        result.targetFile = fileMatch[1];
    }
    return result;
}
function extractComplexity(desc) {
    const match = desc.match(/\[Complexity:\s*(XS|S|M|L|XL)\]/i);
    if (match && match[1]) {
        return { complexity: match[1].toUpperCase() };
    }
    return {};
}
function extractDepends(section) {
    const dependsMatch = section.match(/\*\*Depends:\*\*\s*(.+)/i);
    if (!dependsMatch?.[1])
        return [];
    const dependsText = dependsMatch[1].trim();
    if (dependsText.toLowerCase() === "none")
        return [];
    const taskIdRegex = /(?:Tasks?\s+)?(\d+(?:\.\d+)+)/gi;
    const ids = Array.from(dependsText.matchAll(taskIdRegex), (m) => m[1] ?? "");
    return ids.filter((id) => id !== "");
}
function extractBlocked(section) {
    const blockedMatch = section.match(/\*\*Blocked:\*\*\s*(.+)/i);
    if (!blockedMatch?.[1])
        return undefined;
    const blockedText = blockedMatch[1].trim();
    if (blockedText === "" || blockedText.toLowerCase() === "none") {
        return undefined;
    }
    return blockedText;
}
function isTaskHeader(line) {
    return /^####\s+(?:\[[^\]]+\]\s+)?Task\s+\d+(?:\.\d+)+:/.test(line);
}
function isMetadataLine(line) {
    return /^\*\*(Depends|Blocked|Status):\*\*/i.test(line);
}
function isChecklistItem(line) {
    return /^-\s*\[([ x])\]/.test(line);
}
function shouldSkipLine(line, inDescription, collectedCount) {
    if (isTaskHeader(line))
        return true;
    if (isMetadataLine(line))
        return true;
    if (isChecklistItem(line))
        return true;
    if (!inDescription)
        return true;
    if (line.trim() === "" && collectedCount === 0)
        return true;
    return false;
}
function extractTaskDescription(section) {
    const lines = section.split("\n");
    const descriptionLines = [];
    let inDescription = false;
    for (const line of lines) {
        if (isTaskHeader(line)) {
            inDescription = true;
            continue;
        }
        if (shouldSkipLine(line, inDescription, descriptionLines.length)) {
            continue;
        }
        descriptionLines.push(line);
    }
    const description = descriptionLines.join("\n").trim();
    return description.length > 0 ? description : undefined;
}
function extractPhases(content, allTasks) {
    const phaseRegex = /^###\s+Phase\s+(\d+):\s*([^[]+)\s*\[Complexity:\s*(\w+)\]/gm;
    const matches = Array.from(content.matchAll(phaseRegex));
    return matches.map((match) => {
        const phaseNumber = Number.parseInt(match[1] ?? "0", 10);
        const phaseTasks = allTasks.filter((task) => {
            const taskIdPrefix = task.id.split(".")[0] ?? "";
            return Number.parseInt(taskIdPrefix, 10) === phaseNumber;
        });
        return {
            number: phaseNumber,
            title: (match[2] ?? "").trim(),
            complexity: match[3] ?? "S",
            tasks: phaseTasks,
        };
    });
}
//# sourceMappingURL=parser.js.map