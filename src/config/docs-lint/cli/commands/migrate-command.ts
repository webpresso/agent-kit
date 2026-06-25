import type { FileSystem, MigratorDeps } from "#config/docs-lint/cli/interfaces";

import { randomUUID } from "node:crypto";
import type { DocType, MigrationResult } from "#config/docs-lint/index";

import { glob } from "glob";
import { existsSync } from "node:fs";
import { copyFile, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { relative } from "node:path";

import { getNonCanonicalPlanningPathViolation } from "#config/docs-lint/cli/planning-path";
import {
  hasBoldMetadata,
  normalizeBoldMetadata,
  parseBoldMetadata,
} from "#config/docs-lint/parsers/bold-metadata";
import { generateFrontmatter, parseFrontmatter } from "#config/docs-lint/parsers/frontmatter";
import { detectDocType } from "#config/docs-lint/schemas/index";

/**
 * Filesystem surface required for the atomic backup write.
 *
 * The shared {@link FileSystem} interface intentionally stays narrow; the
 * backup path additionally needs an atomic `rename` (same-filesystem move) and
 * an `unlink` for temp cleanup. The real adapter constructed in
 * {@link createMigrateCommand} supplies both, and tests inject fakes that do
 * too, so the cast at the call site is sound.
 */
type AtomicBackupFs = FileSystem & {
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
};

export interface MigrateOptions {
  files?: string[];
  dryRun?: boolean;
  backup?: boolean;
  verbose?: boolean;
  force?: boolean;
}

const DEFAULT_PATTERNS = ["**/*.md"];
const IGNORE_PATTERNS = ["**/node_modules/**", "**/dist/**", "**/.git/**"];

/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDate(): string {
  const result = new Date().toISOString().split("T")[0];
  return result ?? new Date().toISOString().slice(0, 10);
}

/**
 * Helper to remove keys from an object.
 */
function without(obj: Record<string, unknown>, ...keys: string[]) {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Simplified frontmatter generators for the 5 doc types.
 */
const FRONTMATTER_GENERATORS: Record<
  DocType,
  (
    filePath: string,
    existingMeta: Record<string, unknown>,
    today: string,
  ) => Record<string, unknown>
> = {
  guide: (_path, meta, today) => ({
    type: "guide",
    last_updated: meta.last_updated ?? today,
    ...without(meta, "type", "last_updated"),
  }),
  system: (_path, meta, today) => ({
    type: "system",
    last_updated: meta.last_updated ?? today,
    ...without(meta, "type", "last_updated"),
  }),
  research: (_path, meta, today) => ({
    type: "research",
    last_updated: meta.last_updated ?? today,
    ...without(meta, "type", "last_updated"),
  }),
  blueprint: (_path, meta, today) => ({
    type: "blueprint",
    status: meta.status ?? "draft",
    complexity: meta.complexity ?? "M",
    last_updated: meta.last_updated ?? today,
    ...without(meta, "type", "status", "complexity", "last_updated"),
  }),
  decision: (_path, meta, today) => ({
    type: "decision",
    status: meta.status ?? "proposed",
    date: meta.date ?? today,
    decision: meta.decision ?? "Decision description",
    ...without(meta, "type", "status", "date", "decision"),
  }),
  unknown: (_path, meta) => ({ ...meta }),
};

/**
 * Generate default frontmatter for a doc type.
 */
function generateDefaultFrontmatter(
  docType: DocType,
  filePath: string,
  existingMeta: Record<string, unknown> = {},
): Record<string, unknown> {
  const generator = FRONTMATTER_GENERATORS[docType];
  return generator(filePath, existingMeta, getTodayDate());
}

export class MigrateCommand {
  constructor(private deps: MigratorDeps) {}

  async run(options: MigrateOptions): Promise<number> {
    // Log dry-run message if applicable
    if (options.dryRun) {
      this.deps.logger.info("Running in dry-run mode - no files will be modified");
    }

    // Log start message
    this.deps.logger.info("Migrating documentation files...");

    // Get files to migrate
    const files = await this.getFilesToMigrate(options);

    // Return early if no files (exit 0)
    if (!files.length) {
      this.deps.logger.warn("No files found to migrate");
      return 0;
    }

    // Log file count
    this.deps.logger.info(`Found ${files.length} file(s) to process`);

    // Migrate all files
    const results: MigrationResult[] = [];
    for (const file of files) {
      const result = await this.migrateFile(file, options);
      results.push(result);
    }

    // Format results
    this.formatResults(results);

    // Return exit code (1 if errors, 0 otherwise)
    const hasErrors = results.some((r) => r.action === "error");
    return hasErrors ? 1 : 0;
  }

  private async getFilesToMigrate(options: MigrateOptions): Promise<string[]> {
    // If options.files provided, return those
    if (options.files && options.files.length > 0) {
      return options.files;
    }

    // Otherwise, glob with DEFAULT_PATTERNS and IGNORE_PATTERNS
    return await this.deps.glob(DEFAULT_PATTERNS, {
      ignore: IGNORE_PATTERNS,
      cwd: this.deps.process.cwd(),
      absolute: true,
    });
  }

  private async migrateFile(filePath: string, options: MigrateOptions): Promise<MigrationResult> {
    const relativePath = relative(this.deps.process.cwd(), filePath);

    const planningPathViolation = getNonCanonicalPlanningPathViolation(relativePath);
    if (planningPathViolation) {
      return {
        file: relativePath,
        action: "error",
        docType: "unknown",
        message: planningPathViolation,
      };
    }

    try {
      const content = await this.deps.fs.readFile(filePath);
      const parsed = parseFrontmatter(content);
      const normalizedPath = relativePath.replace(/^(\.\.[\\/])+/, "");
      const docType = detectDocType(normalizedPath);

      // Skip if has frontmatter and not force
      if (parsed.hasFrontmatter && !options.force) {
        return this.createSkippedResult(relativePath, docType, options);
      }

      const { existingMeta, contentToUse } = this.extractExistingMetadata(
        content,
        parsed,
        relativePath,
        options,
      );

      const newFrontmatter = generateDefaultFrontmatter(docType, filePath, existingMeta);
      const frontmatterStr = generateFrontmatter(newFrontmatter);
      const newContent = `${frontmatterStr}\n${contentToUse.trimStart()}`;

      if (options.dryRun) {
        return this.handleDryRun(relativePath, docType, newFrontmatter, parsed.hasFrontmatter);
      }

      await this.handleBackup(filePath, relativePath, options);
      await this.deps.fs.writeFile(filePath, newContent);

      return {
        file: relativePath,
        action: parsed.hasFrontmatter ? "updated" : "added",
        docType,
      };
    } catch (error) {
      return {
        file: relativePath,
        action: "error",
        docType: "unknown",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private createSkippedResult(
    relativePath: string,
    docType: DocType,
    options: MigrateOptions,
  ): MigrationResult {
    if (options.verbose) {
      this.deps.logger.debug(`${relativePath}: already has frontmatter, skipping`);
    }
    return {
      file: relativePath,
      action: "skipped",
      docType,
      message: "Already has frontmatter",
    };
  }

  private extractExistingMetadata(
    content: string,
    parsed: { hasFrontmatter: boolean; frontmatter: Record<string, unknown>; content: string },
    relativePath: string,
    options: MigrateOptions,
  ): { existingMeta: Record<string, unknown>; contentToUse: string } {
    let existingMeta: Record<string, unknown> = {};
    let contentToUse = content;

    if (hasBoldMetadata(content)) {
      const { metadata, contentWithoutMetadata } = parseBoldMetadata(content);
      existingMeta = normalizeBoldMetadata(metadata);
      contentToUse = contentWithoutMetadata;

      if (options.verbose) {
        this.deps.logger.debug(
          `${relativePath}: found bold metadata: ${JSON.stringify(existingMeta)}`,
        );
      }
    } else if (!parsed.hasFrontmatter) {
      this.deps.logger.warn(`${relativePath}: No metadata found, using defaults`);
    }

    if (parsed.hasFrontmatter) {
      existingMeta = { ...existingMeta, ...parsed.frontmatter };
      contentToUse = parsed.content;
    }

    return { existingMeta, contentToUse };
  }

  private handleDryRun(
    relativePath: string,
    docType: DocType,
    newFrontmatter: Record<string, unknown>,
    hadFrontmatter: boolean,
  ): MigrationResult {
    this.deps.logger.info(`[DRY RUN] ${relativePath}`);
    this.deps.logger.info(`  Type: ${docType}`);
    this.deps.logger.info(`  Frontmatter: ${JSON.stringify(newFrontmatter)}`);
    return {
      file: relativePath,
      action: hadFrontmatter ? "updated" : "added",
      docType,
      message: "Would add frontmatter",
    };
  }

  private async handleBackup(
    filePath: string,
    relativePath: string,
    options: MigrateOptions,
  ): Promise<void> {
    if (!options.backup) return;

    const backupPath = `${filePath}.bak`;
    // Skip if a backup already exists — this preserves the FIRST (true
    // original) backup across re-runs. Do NOT change this semantics.
    if (this.deps.fs.existsSync(backupPath)) {
      this.deps.logger.warn(`${relativePath}: Backup already exists, skipping backup creation`);
      return;
    }

    // The real adapter and the test fakes both provide rename + unlink; the
    // shared FileSystem interface stays narrow, so narrow here at the call site.
    const fs = this.deps.fs as AtomicBackupFs;

    // Write the backup atomically: copy to a unique temp path in the same
    // directory (so the rename is atomic on the same filesystem), then rename
    // it into place. If copyFile/rename is interrupted, the destination .bak
    // is never a partial file — the temp is cleaned up in `finally`. Without
    // this, an interrupted copy would leave a corrupt .bak that the
    // existsSync-skip above would then preserve permanently as the "original".
    const tempPath = `${backupPath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
    try {
      await fs.copyFile(filePath, tempPath);
      await fs.rename(tempPath, backupPath);
    } finally {
      // Clean up the temp if it still exists (copy failed, or rename failed
      // before consuming it). Swallow ENOENT-style cleanup errors: the rename
      // already moved the temp away on the success path.
      try {
        await fs.unlink(tempPath);
      } catch {
        // temp already renamed into place or never created — nothing to clean.
      }
    }
  }

  private formatResults(results: MigrationResult[]): void {
    // Count added/updated/skipped/errors
    const added = results.filter((r) => r.action === "added");
    const updated = results.filter((r) => r.action === "updated");
    const skipped = results.filter((r) => r.action === "skipped");
    const errors = results.filter((r) => r.action === "error");

    // Log summary
    this.deps.logger.success(
      `Migration complete - Added: ${added.length}, Updated: ${updated.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`,
    );

    // Log errors if any
    if (errors.length > 0) {
      for (const error of errors) {
        this.deps.logger.error(`${error.file}: ${error.message}`);
      }
    }
  }
}

const consoleLogger = {
  info: (msg: string) => console.info(msg),
  success: (msg: string) => console.info(msg),
  error: (msg: string) => console.error(msg),
  warn: (msg: string) => console.warn(msg),
  debug: (msg: string) => console.debug(msg),
  log: (msg: string) => console.log(msg),
};

export function createMigrateCommand(deps?: MigratorDeps): MigrateCommand {
  const resolvedDeps: MigratorDeps = deps ?? {
    fs: {
      readFile: (path: string) => readFile(path, "utf-8"),
      writeFile: (path: string, content: string) => writeFile(path, content, "utf-8"),
      copyFile: (src: string, dest: string) => copyFile(src, dest),
      existsSync: (path: string) => existsSync(path),
      rename: (oldPath: string, newPath: string) => rename(oldPath, newPath),
      unlink: (path: string) => unlink(path),
      // Extra rename/unlink beyond the FileSystem interface are intentional —
      // handleBackup narrows deps.fs to AtomicBackupFs for the atomic write.
    } as AtomicBackupFs,
    logger: consoleLogger,
    process: {
      cwd: () => process.cwd(),
      exit: (code: number) => process.exit(code),
      execSync: () => "",
    },
    glob: async (patterns: string[], opts: unknown) =>
      (await glob(patterns, opts as Parameters<typeof glob>[1])).map(String),
  };
  return new MigrateCommand(resolvedDeps);
}
