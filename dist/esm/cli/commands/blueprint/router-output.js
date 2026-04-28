const BLUEPRINT_HELP = [
    'Blueprint management',
    '',
    'Commands:',
    '  list [status]',
    '  new <goal> --complexity <XS|S|M|L|XL>',
    '  show <slug>',
    '  exec <slug>',
    '  exec status <slug>',
    '  exec resume <slug>',
    '  exec stop <slug>',
    '  exec logs <slug>',
    '  start <slug>',
    '  park <slug>',
    '  task start <slug> <taskId>',
    '  task block <slug> <taskId> --reason <text>',
    '  task unblock <slug> <taskId>',
    '  task complete <slug> <taskId>',
    '  finalize <slug>',
    '  audit [--staged|--all] [--strict]',
    '  move <slug> <status> --force-recovery',
].join('\n');
function formatTaskLine(task) {
    const checkbox = task.status === 'done' ? 'x' : ' ';
    return `- [${checkbox}] ${task.id} ${task.title}`;
}
export function getBlueprintHelpText() {
    return BLUEPRINT_HELP;
}
export function formatBlueprintSummaries(summaries) {
    if (!summaries.length) {
        return 'No blueprints found.';
    }
    return summaries
        .map((summary) => {
        const malformedSuffix = summary.malformed ? ' malformed=yes' : '';
        return `${summary.name} status=${summary.status} complexity=${summary.complexity} progress=${summary.progress}% tasks=${summary.taskCount}${malformedSuffix}`;
    })
        .join('\n');
}
export function formatBlueprintDetails(result) {
    const doneTasks = result.blueprint.tasks.filter((task) => task.status === 'done').length;
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
        : ['- No tasks declared'];
    return [...header, '', 'task list:', ...tasks].join('\n');
}
export function formatBlueprintCreation(result) {
    return [
        `Created blueprint draft/${result.slug}`,
        `title: ${result.title}`,
        `complexity: ${result.complexity}`,
        `path: ${result.path}`,
    ].join('\n');
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
        lines.push(`artifacts: ${result.artifactPaths.join(', ')}`);
    }
    return lines.join('\n');
}
export function formatBlueprintAudit(result) {
    if (!result.issues.length) {
        return 'Blueprint audit passed.';
    }
    return result.issues
        .map((issue) => `[${issue.level}] ${issue.file ? `${issue.file}: ` : ''}${issue.message}`)
        .join('\n');
}
export function printBlueprintOutput(value, asJson) {
    if (asJson) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
export function handleBlueprintError(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
}
//# sourceMappingURL=router-output.js.map