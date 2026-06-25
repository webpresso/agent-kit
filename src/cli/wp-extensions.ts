import type { CAC } from "cac";

import {
  loadWpExtensions,
  resolveAcceptedExtensionAliases,
  type LoadWpExtensionsOptions,
  type WpExtensionAliasV1,
} from "#wp-extension";

export interface RegisterWpExtensionsOptions extends LoadWpExtensionsOptions {
  readonly cli: CAC;
  readonly baseCommands: readonly string[];
}

export interface RegisteredWpExtensions {
  readonly aliasMap: ReadonlyMap<string, WpExtensionAliasV1>;
  readonly warnings: readonly string[];
  readonly commandNames: readonly string[];
}

export async function registerWpExtensions(
  options: RegisterWpExtensionsOptions,
): Promise<RegisteredWpExtensions> {
  const loaded = await loadWpExtensions(options);
  const warnings = loaded.flatMap((entry) => entry.warnings);
  const commandNames: string[] = [];
  const blockedCommandNames = new Set(options.baseCommands);
  const registeredCommandNames = new Set<string>();

  for (const extension of loaded) {
    if (!extension.extension || !extension.compatible || !extension.detected) continue;
    for (const command of extension.extension.commands) {
      if (blockedCommandNames.has(command.name)) {
        warnings.push(
          `${extension.packageName}: skipped command "${command.name}" because it collides with an existing command`,
        );
        continue;
      }
      command.register(options.cli);
      commandNames.push(command.name);
      blockedCommandNames.add(command.name);
      registeredCommandNames.add(command.name);
    }
  }

  const aliasResolution = resolveAcceptedExtensionAliases(
    loaded,
    options.baseCommands,
    registeredCommandNames,
  );

  return {
    aliasMap: aliasResolution.aliases,
    warnings: [...warnings, ...aliasResolution.warnings],
    commandNames,
  };
}

export function resolveWpCommandAlias(
  command: string | undefined,
  aliasMap: ReadonlyMap<string, WpExtensionAliasV1>,
): string | undefined {
  if (!command) return command;
  return aliasMap.get(command)?.commandName ?? command;
}
