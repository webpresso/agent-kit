import { loadWpExtensions, resolveAcceptedExtensionAliases, } from "#wp-extension";
export async function registerWpExtensions(options) {
    const loaded = await loadWpExtensions(options);
    const warnings = loaded.flatMap((entry) => entry.warnings);
    const commandNames = [];
    const blockedCommandNames = new Set(options.baseCommands);
    const registeredCommandNames = new Set();
    for (const extension of loaded) {
        if (!extension.extension || !extension.compatible || !extension.detected)
            continue;
        for (const command of extension.extension.commands) {
            if (blockedCommandNames.has(command.name)) {
                warnings.push(`${extension.packageName}: skipped command "${command.name}" because it collides with an existing command`);
                continue;
            }
            command.register(options.cli);
            commandNames.push(command.name);
            blockedCommandNames.add(command.name);
            registeredCommandNames.add(command.name);
        }
    }
    const aliasResolution = resolveAcceptedExtensionAliases(loaded, options.baseCommands, registeredCommandNames);
    return {
        aliasMap: aliasResolution.aliases,
        warnings: [...warnings, ...aliasResolution.warnings],
        commandNames,
    };
}
export function resolveWpCommandAlias(command, aliasMap) {
    if (!command)
        return command;
    return aliasMap.get(command)?.commandName ?? command;
}
//# sourceMappingURL=wp-extensions.js.map