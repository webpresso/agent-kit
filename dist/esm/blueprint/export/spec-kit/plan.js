import { titleLine } from './_field-map.js';
/**
 * Emit plan.md — Implementation Plan referencing spec.md, grouped by wave.
 * Pure function, <40 LOC.
 */
export function emitPlan(parsed) {
    const sections = [
        titleLine(parsed, 'Implementation Plan'),
        '',
        '> See [spec.md](spec.md) for full specification.',
        '',
        '## Architecture',
        '',
        parsed.complexity ? `Complexity: **${parsed.complexity}**` : '_No architecture notes._',
        '',
        '## Waves',
        '',
    ];
    if (parsed.tasks.length === 0) {
        sections.push('_No tasks defined._');
        return sections.join('\n');
    }
    const byWave = groupByWave(parsed.tasks);
    for (const [wave, tasks] of byWave) {
        sections.push(`### ${wave}`, '');
        for (const task of tasks) {
            sections.push(`- **${task.taskId}**: ${task.title}`);
        }
        sections.push('');
    }
    return sections.join('\n').trimEnd() + '\n';
}
function groupByWave(tasks) {
    const map = new Map();
    for (const task of tasks) {
        const wave = task.wave ?? 'Wave 1';
        const bucket = map.get(wave) ?? [];
        bucket.push(task);
        map.set(wave, bucket);
    }
    return map;
}
//# sourceMappingURL=plan.js.map