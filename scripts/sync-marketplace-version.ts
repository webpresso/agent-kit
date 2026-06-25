/**
 * Keeps Claude plugin publishing manifests and snapshots in sync with
 * package.json#version. Run automatically as part of `changeset version`
 * so marketplace/plugin metadata never drifts after a release bump.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(repoRoot, "package.json");
const marketplacePath = resolve(repoRoot, ".claude-plugin", "marketplace.json");
const pluginPath = resolve(repoRoot, ".claude-plugin", "plugin.json");
const codexPluginPath = resolve(repoRoot, ".codex-plugin", "plugin.json");
const pluginFixturePath = resolve(repoRoot, "__fixtures__", "plugin-manifest", "expected.json");

const packageManifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
  version: string;
};
const { version } = packageManifest;

const marketplaceManifest = JSON.parse(readFileSync(marketplacePath, "utf8")) as Record<
  string,
  unknown
> & {
  metadata?: { version?: string };
  version?: string;
};

marketplaceManifest.version = version;
if (marketplaceManifest.metadata && typeof marketplaceManifest.metadata === "object") {
  marketplaceManifest.metadata.version = version;
}

const pluginManifest = JSON.parse(readFileSync(pluginPath, "utf8")) as Record<string, unknown> & {
  version?: string;
};

pluginManifest.version = version;

const codexPluginManifest = JSON.parse(readFileSync(codexPluginPath, "utf8")) as Record<
  string,
  unknown
> & {
  version?: string;
};

codexPluginManifest.version = version;

const pluginJson = JSON.stringify(pluginManifest, null, 2) + "\n";

writeFileSync(marketplacePath, JSON.stringify(marketplaceManifest, null, 2) + "\n");
writeFileSync(pluginPath, pluginJson);
writeFileSync(codexPluginPath, JSON.stringify(codexPluginManifest, null, 2) + "\n");
writeFileSync(pluginFixturePath, pluginJson);
writeFileSync(packagePath, JSON.stringify(packageManifest, null, 2) + "\n");
console.log(`Plugin manifests synced to ${version}`);
