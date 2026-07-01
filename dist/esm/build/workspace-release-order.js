/**
 * Order workspace packages so local dependencies build/publish before their dependents.
 * Fails closed on cycles rather than silently falling back to a broken order.
 */
export function orderWorkspacePackagesForRelease(packages) {
    const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
    const incoming = new Map();
    const outgoing = new Map();
    for (const pkg of packages) {
        incoming.set(pkg.name, new Set());
        outgoing.set(pkg.name, new Set());
    }
    for (const pkg of packages) {
        for (const depName of pkg.workspaceDependencies) {
            if (!byName.has(depName) || depName === pkg.name)
                continue;
            incoming.get(pkg.name)?.add(depName);
            outgoing.get(depName)?.add(pkg.name);
        }
    }
    const ready = [...packages]
        .filter((pkg) => (incoming.get(pkg.name)?.size ?? 0) === 0)
        .map((pkg) => pkg.name)
        .sort((a, b) => a.localeCompare(b));
    const ordered = [];
    while (ready.length > 0) {
        const name = ready.shift();
        if (!name)
            break;
        const pkg = byName.get(name);
        if (!pkg)
            continue;
        ordered.push(pkg);
        for (const dependentName of [...(outgoing.get(name) ?? [])].sort((a, b) => a.localeCompare(b))) {
            const deps = incoming.get(dependentName);
            deps?.delete(name);
            if ((deps?.size ?? 0) === 0)
                ready.push(dependentName);
        }
        ready.sort((a, b) => a.localeCompare(b));
    }
    if (ordered.length !== packages.length) {
        const remaining = packages
            .map((pkg) => pkg.name)
            .filter((name) => !ordered.some((pkg) => pkg.name === name))
            .sort((a, b) => a.localeCompare(b));
        throw new Error(`workspace release package graph contains a cycle or unresolved local dependency: ${remaining.join(", ")}`);
    }
    return ordered;
}
//# sourceMappingURL=workspace-release-order.js.map