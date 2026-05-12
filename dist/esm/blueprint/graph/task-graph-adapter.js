import { normalizedGraphSchema } from '#graph/schema';
export function taskGraphToNormalizedGraph(taskGraph) {
    const tasks = taskGraph.getTopologicalOrder();
    const waves = taskGraph.getWaves();
    const waveByTaskId = new Map();
    for (const [waveIndex, wave] of waves.entries()) {
        for (const task of wave) {
            waveByTaskId.set(task.id, waveIndex);
        }
    }
    const nodes = tasks.map((task) => ({
        id: task.id,
        type: 'task',
        label: task.data?.title ?? task.id,
        metadata: {
            wave_number: waveByTaskId.get(task.id) ?? 0,
        },
    }));
    const edges = tasks.flatMap((task) => task.dependencies.map((dependencyId) => ({
        source: dependencyId,
        target: task.id,
        type: 'depends_on',
    })));
    return normalizedGraphSchema.parse({
        nodes,
        edges,
        layout: { direction: 'TD' },
    });
}
//# sourceMappingURL=task-graph-adapter.js.map