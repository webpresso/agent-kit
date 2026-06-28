/**
 * Validate task dependency graph in blueprint markdown.
 *
 * Checks:
 * - No dangling dependency references (Task X.Y that doesn't exist)
 * - No circular dependencies (A → B → A)
 */
import { parseTaskBlocks } from "./task-blocks.js";
const TASK_ID_IN_DEPENDS_REGEX = /Task\s+(\d+\.\d+)/g;
/** Extract task IDs and their dependencies from markdown using line-by-line parsing */
function extractTaskDeps(markdown) {
    const taskDeps = new Map();
    function finalizeBlock(taskId, block) {
        const deps = [];
        const dependsMatch = /\*\*Depends:\*\*\s*(.*)/m.exec(block);
        if (dependsMatch?.[1]) {
            const dependsText = dependsMatch[1];
            let refMatch;
            const regex = new RegExp(TASK_ID_IN_DEPENDS_REGEX.source, "g");
            while ((refMatch = regex.exec(dependsText)) !== null) {
                if (refMatch[1]) {
                    deps.push(refMatch[1]);
                }
            }
        }
        taskDeps.set(taskId, deps);
    }
    for (const { taskId, block } of parseTaskBlocks(markdown)) {
        finalizeBlock(taskId, block);
    }
    return taskDeps;
}
/** Find dangling references — deps that reference non-existent tasks */
function findDanglingRefs(taskDeps) {
    const knownIds = new Set(taskDeps.keys());
    const dangling = [];
    for (const [taskId, deps] of taskDeps) {
        for (const dep of deps) {
            if (!knownIds.has(dep)) {
                dangling.push(`Task ${taskId} → Task ${dep} (does not exist)`);
            }
        }
    }
    return dangling;
}
/** Detect circular dependencies using DFS. Returns cycle descriptions. */
function findCycles(taskDeps) {
    const WHITE = 0; // unvisited
    const GRAY = 1; // in current DFS path
    const BLACK = 2; // fully visited
    const color = new Map();
    const cycles = [];
    for (const id of taskDeps.keys()) {
        color.set(id, WHITE);
    }
    function dfs(node, path) {
        color.set(node, GRAY);
        path.push(node);
        for (const neighbor of taskDeps.get(node) ?? []) {
            if (!color.has(neighbor))
                continue; // dangling ref, skip
            if (color.get(neighbor) === GRAY) {
                // Found cycle — trace back to where cycle starts
                const cycleStart = path.indexOf(neighbor);
                if (cycleStart !== -1) {
                    const cycle = [...path.slice(cycleStart), neighbor];
                    cycles.push(cycle.map((id) => `Task ${id}`).join(" → "));
                }
            }
            else if (color.get(neighbor) === WHITE) {
                dfs(neighbor, path);
            }
        }
        path.pop();
        color.set(node, BLACK);
    }
    for (const id of taskDeps.keys()) {
        if (color.get(id) === WHITE) {
            dfs(id, []);
        }
    }
    return cycles;
}
/**
 * Validate task dependency graph in blueprint markdown.
 */
export function validateTaskDependencies(markdown) {
    const taskDeps = extractTaskDeps(markdown);
    if (taskDeps.size === 0) {
        return { valid: true };
    }
    const danglingRefs = findDanglingRefs(taskDeps);
    const cycles = findCycles(taskDeps);
    if (!danglingRefs.length && !cycles.length) {
        return { valid: true };
    }
    const errorParts = [];
    if (cycles.length > 0) {
        errorParts.push(`Circular dependencies detected: ${cycles.join("; ")}`);
    }
    if (danglingRefs.length > 0) {
        errorParts.push(`Dangling dependency references: ${danglingRefs.join("; ")}`);
    }
    return {
        valid: false,
        error: errorParts.join(". "),
        details: {
            cycles: cycles.length > 0 ? cycles : undefined,
            danglingRefs: danglingRefs.length > 0 ? danglingRefs : undefined,
        },
    };
}
//# sourceMappingURL=dependencies.js.map