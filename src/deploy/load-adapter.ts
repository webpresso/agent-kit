import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { DeployAdapter, LoadedDeployAdapter } from "./types.js";
import { loadWebpressoConfigSafe } from "#e2e/load-host-adapter";

const DEFAULT_DEPLOY_ADAPTER_EXPORTS = [
  "webpressoDeployAdapter",
  "deployAdapter",
  "default",
] as const;

export class DeployAdapterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployAdapterConfigError";
  }
}

export async function loadDeployAdapter(
  cwd: string = process.cwd(),
): Promise<LoadedDeployAdapter | null> {
  const loadedConfig = await loadWebpressoConfigSafe({ cwd });
  const deployConfig = loadedConfig?.config.deploy;
  if (!loadedConfig || !deployConfig?.adapterModule) return null;

  const moduleSpecifier = resolveModuleSpecifier(
    deployConfig.adapterModule,
    loadedConfig.configPath,
  );
  let moduleNamespace: Record<string, unknown>;
  try {
    moduleNamespace = (await import(moduleSpecifier)) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeployAdapterConfigError(
      `Failed to load deploy adapter module "${deployConfig.adapterModule}" from ${loadedConfig.configPath}: ${message}`,
    );
  }

  const exportNames = deployConfig.adapterExport
    ? [deployConfig.adapterExport, ...DEFAULT_DEPLOY_ADAPTER_EXPORTS]
    : [...DEFAULT_DEPLOY_ADAPTER_EXPORTS];

  for (const exportName of exportNames) {
    const candidate = moduleNamespace[exportName];
    if (isDeployAdapter(candidate)) {
      return {
        adapter: candidate,
        config: loadedConfig.config,
        configPath: loadedConfig.configPath,
        moduleSpecifier,
        exportName,
      };
    }
  }

  throw new DeployAdapterConfigError(
    `Deploy adapter module "${deployConfig.adapterModule}" does not export a deploy adapter. Tried ${exportNames.join(", ")}.`,
  );
}

function isDeployAdapter(value: unknown): value is DeployAdapter {
  return Boolean(
    value && typeof value === "object" && typeof (value as DeployAdapter).createPlan === "function",
  );
}

function resolveModuleSpecifier(moduleSpecifier: string, configPath: string): string {
  if (moduleSpecifier.startsWith("file:")) return moduleSpecifier;
  if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
    return pathToFileURL(resolve(dirname(configPath), moduleSpecifier)).href;
  }
  return moduleSpecifier;
}
