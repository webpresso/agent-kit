import matter from "gray-matter";
import { parseBlueprint } from "#core/parser";
import { lifecycleBlueprintStatusSchema } from "#core/schema";
import { updateBlockedReason, updateTaskStatus } from "#markdown/helpers";
import { applyVerification, assertAllTasksHaveCanonicalPassingEvidence } from "#verification.js";
function todayIsoDate() {
    return new Date().toISOString().split("T")[0] ?? new Date().toISOString();
}
export function setBlueprintFrontmatterFields(markdown, updates) {
    const parsed = matter(markdown);
    for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
            delete parsed.data[key];
        }
        else {
            parsed.data[key] = value;
        }
    }
    return matter.stringify(parsed.content, parsed.data);
}
function assertExecutableStatus(status) {
    const parsed = lifecycleBlueprintStatusSchema.safeParse(status);
    if (!parsed.success) {
        throw new Error(`Blueprint status "${status}" is not executable. Normalize it to one of: ${lifecycleBlueprintStatusSchema.options.join(", ")}`);
    }
    return parsed.data;
}
function formatProgress(blueprint) {
    const total = blueprint.tasks.length;
    const done = blueprint.tasks.filter((task) => task.status === "done" || task.status === "dropped").length;
    const blocked = blueprint.tasks.filter((task) => task.status === "blocked").length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return `${percent}% (${done}/${total} tasks done, ${blocked} blocked, updated ${todayIsoDate()})`;
}
function deriveBlueprintStatus(currentStatus) {
    if (currentStatus === "completed" || currentStatus === "archived") {
        return currentStatus;
    }
    return "in-progress";
}
function assertTaskExists(blueprint, taskId) {
    const task = blueprint.tasks.find((entry) => entry.id === taskId);
    if (!task) {
        throw new Error(`Task ${taskId} not found in blueprint ${blueprint.name}`);
    }
    return task;
}
function assertTaskDoneRequirements(markdown, blueprint) {
    if (blueprint.tasks.length === 0) {
        throw new Error(`Blueprint ${blueprint.name} cannot finalize: zero-task blueprints cannot complete through the public lifecycle surface`);
    }
    const tasksRequiringEvidence = [];
    for (const task of blueprint.tasks) {
        if (task.status !== "done" && task.status !== "dropped") {
            throw new Error(`Blueprint ${blueprint.name} cannot finalize: Task ${task.id} is ${task.status}`);
        }
        const { checked, total } = task.acceptanceCriteria;
        if (task.status === "done" && total > 0 && checked !== total) {
            throw new Error(`Blueprint ${blueprint.name} cannot finalize: Task ${task.id} has ${checked}/${total} acceptance criteria checked`);
        }
        if (task.status === "done") {
            tasksRequiringEvidence.push(task.id);
        }
    }
    assertAllTasksHaveCanonicalPassingEvidence(markdown, tasksRequiringEvidence);
}
function applyTaskIntent(markdown, blueprint, intent) {
    const task = assertTaskExists(blueprint, intent.taskId);
    switch (intent.type) {
        case "task_start": {
            if (task.status === "done" || task.status === "dropped") {
                throw new Error(`Task ${task.id} is already ${task.status}`);
            }
            return updateBlockedReason(updateTaskStatus(markdown, task.id, "in-progress"), task.id, "");
        }
        case "task_block": {
            if (task.status === "done" || task.status === "dropped") {
                throw new Error(`Task ${task.id} is already ${task.status}`);
            }
            const reason = intent.reason.trim();
            if (!reason) {
                throw new Error(`Task ${task.id} requires a non-empty block reason`);
            }
            return updateBlockedReason(updateTaskStatus(markdown, task.id, "blocked"), task.id, reason);
        }
        case "task_unblock": {
            if (task.status !== "blocked" && !task.blockedReason) {
                throw new Error(`Task ${task.id} is not blocked`);
            }
            return updateBlockedReason(updateTaskStatus(markdown, task.id, "todo"), task.id, "");
        }
        case "task_complete": {
            throw new Error(`Task ${task.id} cannot be completed without evidence; use task_verify / wp_blueprint_task_verify`);
        }
        case "task_verify": {
            const result = applyVerification(markdown, task.id, intent.evidence);
            if (!result.ok) {
                throw new Error(result.failures.join("; "));
            }
            return result.markdown;
        }
    }
}
export function applyBlueprintLifecycle(markdown, slug, intent) {
    const blueprint = parseBlueprint(markdown, slug);
    const currentStatus = assertExecutableStatus(blueprint.status);
    if ((currentStatus === "completed" || currentStatus === "archived") &&
        intent.type !== "finalize") {
        throw new Error(`Blueprint ${slug} is already ${currentStatus}`);
    }
    let nextMarkdown = markdown;
    let targetStatus = currentStatus;
    const auditEvents = [];
    switch (intent.type) {
        case "start":
            if (currentStatus === "completed" || currentStatus === "archived") {
                throw new Error(`Blueprint ${slug} cannot start from ${currentStatus}`);
            }
            targetStatus = "in-progress";
            nextMarkdown = setBlueprintFrontmatterFields(nextMarkdown, {
                worktree_owner_id: intent.worktreeOwnerId,
                worktree_owner_branch: intent.worktreeOwnerBranch,
            });
            auditEvents.push(`blueprint.start:${slug}`);
            break;
        case "park":
            if (currentStatus === "completed" || currentStatus === "archived") {
                throw new Error(`Blueprint ${slug} cannot park from ${currentStatus}`);
            }
            targetStatus = "parked";
            nextMarkdown = setBlueprintFrontmatterFields(nextMarkdown, {
                worktree_owner_id: undefined,
                worktree_owner_branch: undefined,
            });
            auditEvents.push(`blueprint.park:${slug}`);
            break;
        case "finalize": {
            assertTaskDoneRequirements(markdown, blueprint);
            nextMarkdown = setBlueprintFrontmatterFields(nextMarkdown, {
                worktree_owner_id: undefined,
                worktree_owner_branch: undefined,
            });
            targetStatus = "completed";
            auditEvents.push(`blueprint.finalize:${slug}`);
            break;
        }
        default: {
            nextMarkdown = applyTaskIntent(markdown, blueprint, intent);
            targetStatus = deriveBlueprintStatus(currentStatus === "draft" || currentStatus === "planned" || currentStatus === "parked"
                ? "in-progress"
                : currentStatus);
            auditEvents.push(`blueprint.${intent.type}:${slug}:${intent.taskId}`);
            break;
        }
    }
    nextMarkdown = setBlueprintFrontmatterFields(nextMarkdown, {
        status: targetStatus,
        last_updated: todayIsoDate(),
        completed_at: targetStatus === "completed" ? todayIsoDate() : undefined,
    });
    const reparsed = parseBlueprint(nextMarkdown, slug);
    const progress = formatProgress(reparsed);
    const finalMarkdown = setBlueprintFrontmatterFields(nextMarkdown, {
        progress,
        last_updated: todayIsoDate(),
        completed_at: targetStatus === "completed" ? todayIsoDate() : undefined,
    });
    return {
        auditEvents,
        blueprint: parseBlueprint(finalMarkdown, slug),
        markdown: finalMarkdown,
        progress,
        targetStatus,
    };
}
//# sourceMappingURL=engine.js.map