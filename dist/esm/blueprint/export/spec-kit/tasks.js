import { taskIdLabel, titleLine } from './_field-map.js';
export function emitTasks(parsed) {
    const sections = [titleLine(parsed, 'Tasks'), ''];
    if (parsed.tasks.length === 0) {
        sections.push('_No tasks defined._');
        return sections.join('\n');
    }
    const byWave = parsed.tasks.reduce((m, t) => {
        const w = t.wave ?? 'Wave 1';
        m.set(w, [...(m.get(w) ?? []), t]);
        return m;
    }, new Map());
    let i = 0;
    for (const [wave, tasks] of byWave) {
        const parallel = tasks.length > 1;
        sections.push(`### ${wave}`, '');
        for (const task of tasks) {
            const p = parallel ? ' [P]' : '';
            const ac = task.acceptanceCriteria[0] ?? '';
            const files = task.files.map((f) => f.filePath).join(', ');
            sections.push(`- [ ] ${taskIdLabel(i)}: ${task.title}${p}`);
            if (ac)
                sections.push(`  - Acceptance: ${ac.replace(/^[-*]\s*/, '')}`);
            if (files)
                sections.push(`  - Files: ${files}`);
            i++;
        }
        sections.push('');
    }
    return sections.join('\n').trimEnd() + '\n';
}
//# sourceMappingURL=tasks.js.map