export function parseDevManifest(raw) {
    const input = assertRecord(raw, 'dev manifest');
    if (input.version !== 1) {
        throw new Error('dev manifest version must be 1');
    }
    const rawServices = assertRecord(input.services, 'services');
    const serviceIds = Object.keys(rawServices);
    if (serviceIds.length === 0) {
        throw new Error('dev manifest must define at least one service');
    }
    const services = {};
    for (const id of serviceIds) {
        assertIdentifier(id, `services.${id}`);
        const service = assertRecord(rawServices[id], `services.${id}`);
        const command = assertString(service.command, `services.${id}.command`);
        const args = assertStringArray(service.args ?? [], `services.${id}.args`);
        const dependsOn = assertStringArray(service.dependsOn ?? [], `services.${id}.dependsOn`);
        const env = service.env === undefined ? undefined : assertStringRecord(service.env, `services.${id}.env`);
        const cwd = service.cwd === undefined ? undefined : assertString(service.cwd, `services.${id}.cwd`);
        services[id] = {
            id,
            command,
            args,
            dependsOn,
            ...(cwd ? { cwd } : {}),
            ...(env ? { env } : {}),
            ...(service.readiness
                ? { readiness: normalizeReadiness(service.readiness, `services.${id}.readiness`) }
                : {}),
            ...(service.restart
                ? { restart: normalizeRestart(service.restart, `services.${id}.restart`) }
                : {}),
        };
    }
    for (const [id, service] of Object.entries(services)) {
        for (const dependency of service.dependsOn) {
            if (!services[dependency]) {
                throw new Error(`services.${id}.dependsOn references unknown service "${dependency}"`);
            }
        }
    }
    const groups = {};
    const rawGroups = input.groups ?? {};
    for (const [groupId, rawGroup] of Object.entries(rawGroups)) {
        assertIdentifier(groupId, `groups.${groupId}`);
        const group = assertRecord(rawGroup, `groups.${groupId}`);
        const groupServices = assertStringArray(group.services, `groups.${groupId}.services`);
        if (groupServices.length === 0) {
            throw new Error(`groups.${groupId}.services must include at least one service`);
        }
        for (const serviceId of groupServices) {
            if (!services[serviceId]) {
                throw new Error(`groups.${groupId}.services references unknown service "${serviceId}"`);
            }
        }
        const description = group.description === undefined
            ? undefined
            : assertString(group.description, `groups.${groupId}.description`);
        groups[groupId] = {
            services: groupServices,
            ...(description ? { description } : {}),
        };
    }
    const rawDefaults = input.defaults ?? {};
    const defaults = assertRecord(rawDefaults, 'defaults');
    const target = defaults.target === undefined ? undefined : assertString(defaults.target, 'defaults.target');
    if (target && !services[target] && !groups[target]) {
        throw new Error(`defaults.target references unknown target "${target}"`);
    }
    return {
        version: 1,
        ...(input.name ? { name: assertString(input.name, 'name') } : {}),
        services,
        groups,
        defaults: target ? { target } : {},
    };
}
export function resolveDevTargets(manifest, target = manifest.defaults.target) {
    if (!target) {
        throw new Error('No dev target supplied and defaults.target is not configured');
    }
    const roots = manifest.groups[target]?.services ?? (manifest.services[target] ? [target] : undefined);
    if (!roots) {
        throw new Error(`Unknown dev target "${target}". Known services: ${Object.keys(manifest.services).join(', ')}. Known groups: ${Object.keys(manifest.groups).join(', ')}.`);
    }
    const resolved = [];
    const visited = new Set();
    const visiting = new Set();
    function visit(serviceId, stack) {
        if (visited.has(serviceId))
            return;
        if (visiting.has(serviceId)) {
            const cycleStart = stack.indexOf(serviceId);
            const cycle = [...stack.slice(cycleStart), serviceId];
            throw new Error(`Cyclic dev service dependency detected: ${cycle.join(' -> ')}`);
        }
        const service = manifest.services[serviceId];
        if (!service) {
            throw new Error(`Unknown dev service "${serviceId}"`);
        }
        visiting.add(serviceId);
        for (const dependency of service.dependsOn) {
            visit(dependency, [...stack, serviceId]);
        }
        visiting.delete(serviceId);
        visited.add(serviceId);
        resolved.push(serviceId);
    }
    for (const root of roots) {
        visit(root, []);
    }
    return resolved;
}
function assertRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value;
}
function assertString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${label} must be a non-empty string`);
    }
    return value;
}
function assertStringArray(value, label) {
    if (!Array.isArray(value)) {
        throw new TypeError(`${label} must be an array of strings`);
    }
    return value.map((entry, index) => assertString(entry, `${label}[${index}]`));
}
function assertStringRecord(value, label) {
    const record = assertRecord(value, label);
    const out = {};
    for (const [key, entry] of Object.entries(record)) {
        out[key] = assertString(entry, `${label}.${key}`);
    }
    return out;
}
function assertIdentifier(value, label) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
        throw new Error(`${label} must be a portable identifier`);
    }
}
function normalizeReadiness(value, label) {
    const readiness = assertRecord(value, label);
    if (readiness.type === 'http') {
        return {
            type: 'http',
            ...(readiness.path ? { path: assertString(readiness.path, `${label}.path`) } : {}),
            ...(readiness.url ? { url: assertString(readiness.url, `${label}.url`) } : {}),
            ...optionalPositiveInt(readiness.timeoutMs, `${label}.timeoutMs`, 'timeoutMs'),
            ...optionalPositiveInt(readiness.intervalMs, `${label}.intervalMs`, 'intervalMs'),
        };
    }
    if (readiness.type === 'log') {
        return {
            type: 'log',
            pattern: assertString(readiness.pattern, `${label}.pattern`),
            ...optionalPositiveInt(readiness.timeoutMs, `${label}.timeoutMs`, 'timeoutMs'),
        };
    }
    if (readiness.type === 'manual') {
        return {
            type: 'manual',
            ...(readiness.description
                ? { description: assertString(readiness.description, `${label}.description`) }
                : {}),
        };
    }
    throw new Error(`${label}.type must be http, log, or manual`);
}
function normalizeRestart(value, label) {
    const restart = assertRecord(value, label);
    return {
        ...(restart.onFailure === undefined
            ? {}
            : { onFailure: assertBoolean(restart.onFailure, `${label}.onFailure`) }),
        ...optionalPositiveInt(restart.maxRestarts, `${label}.maxRestarts`, 'maxRestarts'),
    };
}
function assertBoolean(value, label) {
    if (typeof value !== 'boolean') {
        throw new TypeError(`${label} must be a boolean`);
    }
    return value;
}
function optionalPositiveInt(value, label, key) {
    if (value === undefined)
        return {};
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive integer`);
    }
    return { [key]: value };
}
//# sourceMappingURL=dev-manifest.js.map