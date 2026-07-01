import { buildRoadmapModel, planStatusSchema } from "#local";
const BLUEPRINT_HELP = [
    "Blueprint management",
    "",
    "Commands:",
    "  list [status]",
    "  new <goal> --complexity <XS|S|M|L|XL> [--type <blueprint|parent-roadmap>]",
    "  show <slug>",
    "  exec <slug>",
    "  exec status <slug>",
    "  exec resume <slug>",
    "  exec stop <slug>",
    "  exec logs <slug>",
    "  start <slug>",
    "  park <slug>",
    "  task start <slug> <taskId>",
    "  task block <slug> <taskId> --reason <text>",
    "  task unblock <slug> <taskId>",
    "  task complete <slug> <taskId>",
    "  finalize <slug>",
    "  audit [--staged|--all] [--strict]",
    "  move <slug> <status> --force-recovery",
].join("\n");
export function formatTaskLine(task) {
    const checkbox = task.status === "done" || task.status === "dropped" ? "x" : " ";
    return `- [${checkbox}] ${task.id} ${task.title}`;
}
export function getBlueprintHelpText() {
    return BLUEPRINT_HELP;
}
export function summarizeBlueprintInventory(summaries) {
    const byStatus = Object.fromEntries(planStatusSchema.options.toSorted().map((status) => [status, 0]));
    const byType = {
        blueprint: 0,
        "parent-roadmap": 0,
    };
    let completedZeroTask = 0;
    for (const summary of summaries) {
        byStatus[summary.status] = (byStatus[summary.status] ?? 0) + 1;
        byType[summary.type] += 1;
        if (summary.status === "completed" && summary.taskCount === 0) {
            completedZeroTask += 1;
        }
    }
    return {
        total: summaries.length,
        byStatus,
        byType,
        anomalies: {
            completedZeroTask,
        },
    };
}
export function formatBlueprintInventorySummary(summary) {
    const byStatus = Object.entries(summary.byStatus)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => `${status}=${count}`)
        .join(" ");
    const byType = Object.entries(summary.byType)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => `${type}=${count}`)
        .join(" ");
    return [
        `SUMMARY total=${summary.total}`,
        `BY_STATUS ${byStatus}`,
        `BY_TYPE ${byType}`,
        `ANOMALIES completed-zero-task=${summary.anomalies.completedZeroTask}`,
    ].join("\n");
}
export function formatBlueprintSummaries(summaries) {
    if (!summaries.length) {
        return "No blueprints found.";
    }
    const inventorySummary = formatBlueprintInventorySummary(summarizeBlueprintInventory(summaries));
    const hasRoadmaps = summaries.some((summary) => summary.type === "parent-roadmap");
    if (!hasRoadmaps) {
        const lines = summaries.map((summary) => {
            const label = summary.type === "parent-roadmap" ? "ROADMAP" : "BLUEPRINT";
            const malformedSuffix = summary.malformed ? " malformed=yes" : "";
            return `${label} ${summary.name} status=${summary.status} complexity=${summary.complexity} progress=${summary.progress}% tasks=${summary.taskCount}${malformedSuffix}`;
        });
        return [...lines, inventorySummary].join("\n");
    }
    const model = buildRoadmapModel(summaries);
    const attachedChildren = new Set(model.roadmaps.flatMap((roadmap) => roadmap.children.map((child) => child.name)));
    const standaloneBlueprints = summaries
        .filter((summary) => summary.type !== "parent-roadmap" &&
        !summary.parentRoadmap &&
        !attachedChildren.has(summary.name))
        .toSorted((left, right) => left.name.localeCompare(right.name));
    const lines = [];
    for (const roadmap of model.roadmaps) {
        const malformedSuffix = "malformed" in roadmap.roadmap && roadmap.roadmap.malformed ? " malformed=yes" : "";
        lines.push(`ROADMAP ${roadmap.roadmap.name} status=${roadmap.roadmap.status} complexity=${roadmap.roadmap.complexity} children=${roadmap.rollup.children} done=${roadmap.rollup.done} in-progress=${roadmap.rollup.inProgress} planned=${roadmap.rollup.planned} draft=${roadmap.rollup.draft}${malformedSuffix}`);
        for (const child of roadmap.children) {
            const summary = child;
            const childMalformed = summary.malformed ? " malformed=yes" : "";
            lines.push(`  CHILD ${summary.name} status=${summary.status} complexity=${summary.complexity} progress=${summary.progress}% tasks=${summary.taskCount} parent=${roadmap.roadmap.name}${childMalformed}`);
        }
    }
    for (const summary of standaloneBlueprints) {
        const malformedSuffix = summary.malformed ? " malformed=yes" : "";
        lines.push(`BLUEPRINT ${summary.name} status=${summary.status} complexity=${summary.complexity} progress=${summary.progress}% tasks=${summary.taskCount}${malformedSuffix}`);
    }
    if (model.orphanChildren.length > 0) {
        lines.push("ORPHANS");
        for (const orphan of model.orphanChildren) {
            const summary = orphan;
            const malformedSuffix = summary.malformed ? " malformed=yes" : "";
            lines.push(`  BLUEPRINT ${summary.name} status=${summary.status} complexity=${summary.complexity} progress=${summary.progress}% tasks=${summary.taskCount} parent=${summary.parentRoadmap}${malformedSuffix}`);
        }
    }
    return [...lines, inventorySummary].join("\n");
}
export function formatBlueprintDetails(result) {
    const doneTasks = result.blueprint.tasks.filter((task) => task.status === "done" || task.status === "dropped").length;
    const header = [
        `title: ${result.blueprint.title}`,
        `slug: ${result.slug}`,
        `status: ${result.blueprint.status}`,
        `complexity: ${result.blueprint.complexity}`,
        `path: ${result.location.path}`,
        `tasks: ${doneTasks}/${result.blueprint.tasks.length} done`,
    ];
    const tasks = result.blueprint.tasks.length > 0
        ? result.blueprint.tasks.map(formatTaskLine)
        : ["- No tasks declared"];
    return [...header, "", "task list:", ...tasks].join("\n");
}
export function formatBlueprintCreation(result) {
    return [
        `Created blueprint draft/${result.slug}`,
        `title: ${result.title}`,
        `complexity: ${result.complexity}`,
        `path: ${result.path}`,
    ].join("\n");
}
export function formatBlueprintExecution(result) {
    const lines = [
        result.message,
        `action: ${result.action}`,
        `backend: ${result.backend}`,
        `executionId: ${result.executionId}`,
        `slug: ${result.slug}`,
        `status: ${result.status}`,
    ];
    if (result.runtimeSnapshotPath) {
        lines.push(`runtimeSnapshot: ${result.runtimeSnapshotPath}`);
    }
    if (result.bridgePath) {
        lines.push(`bridgePath: ${result.bridgePath}`);
    }
    if (result.teamStateRoot) {
        lines.push(`teamStateRoot: ${result.teamStateRoot}`);
    }
    if (result.logPath) {
        lines.push(`logPath: ${result.logPath}`);
    }
    if (result.artifactPaths?.length) {
        lines.push(`artifacts: ${result.artifactPaths.join(", ")}`);
    }
    return lines.join("\n");
}
export function formatBlueprintAudit(result) {
    if (!result.issues.length) {
        return "Blueprint audit passed.";
    }
    return result.issues
        .map((issue) => `[${issue.level}] ${issue.file ? `${issue.file}: ` : ""}${issue.message}`)
        .join("\n");
}
export function printBlueprintOutput(value, asJson) {
    if (asJson) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}
export class BlueprintCliError extends Error {
    constructor(message) {
        super(message);
        this.name = "BlueprintCliError";
    }
}
export function handleBlueprintError(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    throw new BlueprintCliError(message);
}
//# sourceMappingURL=router-output.js.map