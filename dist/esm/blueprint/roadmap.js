export function buildRoadmapModel(blueprints) {
    const roadmaps = blueprints.filter((blueprint) => blueprint.type === 'parent-roadmap');
    const roadmapByKey = new Map();
    for (const roadmap of roadmaps) {
        roadmapByKey.set(roadmap.name, roadmap);
        roadmapByKey.set(lastSegment(roadmap.name), roadmap);
    }
    const children = blueprints.filter((blueprint) => blueprint.type !== 'parent-roadmap' && blueprint.parentRoadmap);
    const childrenByRoadmap = new Map();
    const orphanChildren = [];
    for (const child of children) {
        const roadmap = resolveParentRoadmap(child.parentRoadmap ?? '', roadmapByKey);
        if (!roadmap) {
            orphanChildren.push(child);
            continue;
        }
        const existing = childrenByRoadmap.get(roadmap.name) ?? [];
        existing.push(child);
        childrenByRoadmap.set(roadmap.name, existing);
    }
    return {
        roadmaps: roadmaps
            .map((roadmap) => {
            const attachedChildren = (childrenByRoadmap.get(roadmap.name) ?? []).toSorted((left, right) => left.name.localeCompare(right.name));
            return {
                roadmap,
                children: attachedChildren,
                rollup: countChildStatuses(attachedChildren),
            };
        })
            .toSorted((left, right) => left.roadmap.name.localeCompare(right.roadmap.name)),
        orphanChildren: orphanChildren.toSorted((left, right) => left.name.localeCompare(right.name)),
    };
}
function countChildStatuses(children) {
    const rollup = {
        children: children.length,
        done: 0,
        inProgress: 0,
        planned: 0,
        draft: 0,
    };
    for (const child of children) {
        if (child.status === 'completed')
            rollup.done += 1;
        else if (child.status === 'in-progress')
            rollup.inProgress += 1;
        else if (child.status === 'planned')
            rollup.planned += 1;
        else if (child.status === 'draft')
            rollup.draft += 1;
    }
    return rollup;
}
function resolveParentRoadmap(parentRoadmap, roadmapByKey) {
    for (const candidate of parentRoadmapCandidates(parentRoadmap)) {
        const roadmap = roadmapByKey.get(candidate);
        if (roadmap)
            return roadmap;
    }
    return undefined;
}
function parentRoadmapCandidates(parentRoadmap) {
    const trimmed = parentRoadmap.trim();
    if (!trimmed)
        return [];
    const candidates = new Set([trimmed, lastSegment(trimmed)]);
    const arrowMatch = trimmed
        .split(/->|→/u)
        .map((part) => part.trim())
        .filter(Boolean);
    const tail = arrowMatch.at(-1);
    if (tail) {
        candidates.add(tail);
        candidates.add(lastSegment(tail));
    }
    return [...candidates];
}
function lastSegment(value) {
    return value.split('/').at(-1) ?? value;
}
//# sourceMappingURL=roadmap.js.map