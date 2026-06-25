import { normalize } from "node:path";

import type { CommandHookMetadata } from "#codex/app-server/types.js";
import { WP_HOOK_BIN_NAMES } from "./ir.js";

// Derived from the WP_HOOK_BIN_NAMES single source of truth (ir.ts) so Codex
// ownership detection cannot drift from the emitted direct `wp hook <name>` set.
export const KNOWN_WEBPRESSO_CODEX_BINS = WP_HOOK_BIN_NAMES;

const KNOWN_WEBPRESSO_CODEX_BIN_SET = new Set<string>(KNOWN_WEBPRESSO_CODEX_BINS);

export interface CodexHookOwnershipMetadata {
  readonly isManaged?: unknown;
  readonly handlerType?: unknown;
  readonly pluginId?: unknown;
  readonly sourcePath?: unknown;
  readonly command?: unknown;
}

export function isWebpressoOwnedCodexHook(
  metadata: unknown,
  expectedSourcePaths: readonly string[],
): metadata is CommandHookMetadata {
  if (!isObject(metadata)) return false;

  const candidate = metadata as CodexHookOwnershipMetadata;
  if (candidate.isManaged !== false) return false;
  if (candidate.handlerType !== "command") return false;
  if (candidate.pluginId !== null) return false;
  if (typeof candidate.sourcePath !== "string") return false;
  if (typeof candidate.command !== "string" || candidate.command.trim() === "") return false;
  if (!isExpectedSourcePath(candidate.sourcePath, expectedSourcePaths)) return false;

  const binName = extractDirectWpHookBin(candidate.command);
  return binName !== null && isKnownWebpressoCodexBin(binName);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExpectedSourcePath(sourcePath: string, expectedSourcePaths: readonly string[]): boolean {
  if (expectedSourcePaths.length === 0) return false;
  const normalizedSourcePath = normalize(sourcePath);
  return expectedSourcePaths.some(
    (expectedPath) => normalize(expectedPath) === normalizedSourcePath,
  );
}

function isKnownWebpressoCodexBin(binName: string): boolean {
  return KNOWN_WEBPRESSO_CODEX_BIN_SET.has(binName);
}

function extractDirectWpHookBin(command: string): string | null {
  const match = /\bwp["']?\s+hook\s+([a-z0-9-]+)/u.exec(command);
  const hookName = match?.[1];
  if (!hookName) return null;
  const binName = `wp-${hookName}`;
  return isKnownWebpressoCodexBin(binName) ? binName : null;
}
