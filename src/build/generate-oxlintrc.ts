#!/usr/bin/env bun
/**
 * Build step: serialize the resolved oxlint config into
 * `dist/esm/config/oxlint/oxlintrc.json`, next to the compiled plugin modules
 * that its relative `jsPlugins` reference. Runs after `tshy` in the `build`
 * script; `wp lint` points oxlint at this file via `--config` so consumers
 * carry no local oxlint config or `oxlint` dependency (Tier-1 DRY model).
 */
import { join } from "node:path";

import { buildOxlintrc } from "#config/oxlint/oxlintrc";

import { atomicWriteFile } from "./normalize-tsconfig-json-exports.js";

export const OXLINTRC_DIST_RELATIVE = "dist/esm/config/oxlint/oxlintrc.json";

/** Serialized oxlintrc.json contents (trailing newline). */
export function renderOxlintrc(): string {
  return `${JSON.stringify(buildOxlintrc(), null, 2)}\n`;
}

if (import.meta.main) {
  const outputPath = join(process.cwd(), OXLINTRC_DIST_RELATIVE);
  atomicWriteFile(outputPath, renderOxlintrc());
  process.stdout.write(`generated ${OXLINTRC_DIST_RELATIVE}\n`);
}
