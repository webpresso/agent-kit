#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface BuildReleaseNotesOptions {
  cwd?: string;
  includeRuntimeAssets?: boolean;
  packageName: string;
  version: string;
}

interface CliOptions extends BuildReleaseNotesOptions {
  out?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractChangesetVersionSection(changelog: string, version: string): string | null {
  const normalized = changelog.replace(/\r\n/g, "\n");
  const versionPattern = escapeRegExp(version);
  const heading = new RegExp(`^##\\s+(?:\\[)?v?${versionPattern}(?:\\])?(?:\\s|$)`, "mu");
  const match = heading.exec(normalized);
  if (!match) return null;

  const sectionStart = normalized.indexOf("\n", match.index);
  if (sectionStart === -1) return "";

  const rest = normalized.slice(sectionStart + 1);
  const nextHeading = /^##\s+/mu.exec(rest);
  const section = (nextHeading ? rest.slice(0, nextHeading.index) : rest).trim();
  return section.length > 0 ? section : "";
}

function readPackageName(packageJsonPath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

export function resolveChangelogPath(packageName: string, cwd = process.cwd()): string {
  const rootPackagePath = resolve(cwd, "package.json");
  if (readPackageName(rootPackagePath) === packageName) {
    return resolve(cwd, "CHANGELOG.md");
  }

  const packagesDir = resolve(cwd, "packages");
  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageDir = join(packagesDir, entry.name);
      if (readPackageName(join(packageDir, "package.json")) === packageName) {
        return join(packageDir, "CHANGELOG.md");
      }
    }
  }

  throw new Error(`Could not resolve changelog path for ${packageName}`);
}

export function buildGithubReleaseNotes(options: BuildReleaseNotesOptions): string {
  const cwd = options.cwd ?? process.cwd();
  const changelogPath = resolveChangelogPath(options.packageName, cwd);
  const section = extractChangesetVersionSection(
    readFileSync(changelogPath, "utf8"),
    options.version,
  );

  if (section === null) {
    throw new Error(
      `Could not find Changesets changelog section for ${options.packageName}@${options.version}`,
    );
  }

  const lines = [
    `${options.packageName} v${options.version} is published to npm.`,
    "",
    `Install with \`pnpm add -D ${options.packageName}\`.`,
    "",
    "## Changeset version information",
    "",
    section,
  ];

  if (options.includeRuntimeAssets) {
    lines.push(
      "",
      "## Native runtime binaries",
      "",
      "Native `wp` runtime binaries are attached for darwin, linux, and windows across arm64/x64 where supported. These standalone binaries are for direct download; npm remains the primary install path.",
    );
  }

  return `${lines.join("\n").trim()}\n`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runtime-assets") {
      options.includeRuntimeAssets = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    index += 1;

    if (arg === "--package") options.packageName = value;
    else if (arg === "--version") options.version = value;
    else if (arg === "--cwd") options.cwd = value;
    else if (arg === "--out") options.out = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.packageName) throw new Error("Missing required --package");
  if (!options.version) throw new Error("Missing required --version");
  return options as CliOptions;
}

if (import.meta.main) {
  try {
    const { out, ...options } = parseArgs(process.argv.slice(2));
    const notes = buildGithubReleaseNotes(options);
    if (out) writeFileSync(out, notes, "utf8");
    else process.stdout.write(notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`github-release-notes: ${message}\n`);
    process.exit(1);
  }
}
