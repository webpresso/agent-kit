#!/usr/bin/env bun

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  SESSION_MEMORY_NATIVE_TARGETS,
  sessionMemoryNativePackageDirName,
  type SessionMemoryNativeTarget,
} from "../src/session-memory/native-targets.js";

export interface SessionMemoryNativeStageOperation {
  readonly target: SessionMemoryNativeTarget;
  readonly source: string;
  readonly packageAddonDestination: string;
  readonly packageManifestDestination: string;
}

interface StageOptions {
  readonly rootDir?: string;
  readonly sourceRootDir?: string;
  readonly selectedTarget?: string;
}

function readPackageVersion(rootDir: string): string {
  const manifest = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as {
    version?: string;
  };
  if (!manifest.version) throw new Error("package.json is missing version");
  return manifest.version;
}

function selectTargets(selectedTarget?: string): readonly SessionMemoryNativeTarget[] {
  if (!selectedTarget) return SESSION_MEMORY_NATIVE_TARGETS;
  if (selectedTarget === "host") {
    return SESSION_MEMORY_NATIVE_TARGETS.filter(
      (target) => target.os === process.platform && target.cpu === process.arch,
    );
  }
  const target = SESSION_MEMORY_NATIVE_TARGETS.find((candidate) => candidate.id === selectedTarget);
  if (!target) throw new Error(`Unknown session-memory native target ${selectedTarget}`);
  return [target];
}

export function buildSessionMemoryNativeStageOperations(
  options: StageOptions = {},
): readonly SessionMemoryNativeStageOperation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const sourceRootDir = options.sourceRootDir ?? resolve(rootDir, "dist", "session-memory-native");
  return selectTargets(options.selectedTarget).map((target) => {
    const packageDir = sessionMemoryNativePackageDirName(target.packageName);
    return {
      target,
      source: resolve(sourceRootDir, target.id, SESSION_MEMORY_NATIVE_ADDON_FILENAME),
      packageAddonDestination: resolve(
        rootDir,
        "dist",
        "session-memory-native-packages",
        packageDir,
        SESSION_MEMORY_NATIVE_ADDON_FILENAME,
      ),
      packageManifestDestination: resolve(
        rootDir,
        "dist",
        "session-memory-native-packages",
        packageDir,
        "package.json",
      ),
    };
  });
}

export function renderSessionMemoryNativePackageManifest(
  target: SessionMemoryNativeTarget,
  version: string,
): string {
  return `${JSON.stringify(
    {
      name: target.packageName,
      version,
      description: `Prebuilt ${target.id} session-memory native addon for @webpresso/agent-kit`,
      license: "MIT",
      type: "commonjs",
      repository: {
        type: "git",
        url: "https://github.com/webpresso/agent-kit",
      },
      os: [target.os],
      cpu: [target.cpu],
      publishConfig: {
        registry: "https://registry.npmjs.org/",
        access: "public",
      },
      main: SESSION_MEMORY_NATIVE_ADDON_FILENAME,
      exports: {
        [`./${SESSION_MEMORY_NATIVE_ADDON_FILENAME}`]: `./${SESSION_MEMORY_NATIVE_ADDON_FILENAME}`,
      },
      files: [SESSION_MEMORY_NATIVE_ADDON_FILENAME],
    },
    null,
    2,
  )}\n`;
}

export function stageSessionMemoryNativeArtifacts({
  rootDir = process.cwd(),
  sourceRootDir,
  dryRun = false,
  allowMissing = false,
  selectedTarget,
}: {
  readonly rootDir?: string;
  readonly sourceRootDir?: string;
  readonly dryRun?: boolean;
  readonly allowMissing?: boolean;
  readonly selectedTarget?: string;
} = {}): readonly string[] {
  const packageVersion = readPackageVersion(rootDir);
  const staged: string[] = [];

  for (const operation of buildSessionMemoryNativeStageOperations({
    rootDir,
    sourceRootDir,
    selectedTarget,
  })) {
    if (!existsSync(operation.source)) {
      const message = `missing session-memory native artifact for ${operation.target.id}: ${operation.source}`;
      if (allowMissing) {
        staged.push(message);
        continue;
      }
      throw new Error(message);
    }

    if (dryRun) {
      staged.push(`${operation.source} -> ${operation.packageAddonDestination}`);
      staged.push(operation.packageManifestDestination);
      continue;
    }

    mkdirSync(dirname(operation.packageAddonDestination), { recursive: true });
    copyFileSync(operation.source, operation.packageAddonDestination);
    writeFileSync(
      operation.packageManifestDestination,
      renderSessionMemoryNativePackageManifest(operation.target, packageVersion),
      "utf8",
    );
    staged.push(operation.packageAddonDestination);
    staged.push(operation.packageManifestDestination);
  }

  return staged;
}

function parseArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  const allowMissing = process.argv.includes("--allow-missing");
  const sourceRootDir = parseArg("--source-dir");
  const selectedTarget = parseArg("--target");
  for (const line of stageSessionMemoryNativeArtifacts({
    sourceRootDir,
    dryRun,
    allowMissing,
    selectedTarget,
  })) {
    console.log(line);
  }
}
