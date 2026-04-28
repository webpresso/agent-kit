import { consola } from 'consola';
import { existsSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { glob } from 'tinyglobby';
import { hasBoldMetadata, normalizeBoldMetadata, parseBoldMetadata } from '#parsers/bold-metadata';
import { generateFrontmatter, parseFrontmatter } from '#parsers/frontmatter';
import { getNonCanonicalPlanningPathViolation } from '#path-contract';
import { detectDocType } from '#schemas';
const DEFAULT_PATTERNS = ['**/*.md'];
const IGNORE_PATTERNS = ['**/node_modules/**', '**/dist/**', '**/.git/**'];
/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDate() {
    const result = new Date().toISOString().split('T')[0];
    return result ?? new Date().toISOString().slice(0, 10);
}
/**
 * Helper to remove keys from an object.
 */
function without(obj, ...keys) {
    const result = { ...obj };
    for (const key of keys) {
        delete result[key];
    }
    return result;
}
/**
 * Simplified frontmatter generators for the 5 doc types.
 */
const FRONTMATTER_GENERATORS = {
    guide: (_path, meta, today) => ({
        type: 'guide',
        last_updated: meta.last_updated ?? today,
        ...without(meta, 'type', 'last_updated'),
    }),
    system: (_path, meta, today) => ({
        type: 'system',
        last_updated: meta.last_updated ?? today,
        ...without(meta, 'type', 'last_updated'),
    }),
    research: (_path, meta, today) => ({
        type: 'research',
        last_updated: meta.last_updated ?? today,
        ...without(meta, 'type', 'last_updated'),
    }),
    blueprint: (_path, meta, today) => ({
        type: 'blueprint',
        status: meta.status ?? 'draft',
        complexity: meta.complexity ?? 'M',
        last_updated: meta.last_updated ?? today,
        ...without(meta, 'type', 'status', 'complexity', 'last_updated'),
    }),
    decision: (_path, meta, today) => ({
        type: 'decision',
        status: meta.status ?? 'proposed',
        date: meta.date ?? today,
        decision: meta.decision ?? 'Decision description',
        ...without(meta, 'type', 'status', 'date', 'decision'),
    }),
    unknown: (_path, meta) => ({ ...meta }),
};
/**
 * Generate default frontmatter for a doc type.
 */
function generateDefaultFrontmatter(docType, filePath, existingMeta = {}) {
    const generator = FRONTMATTER_GENERATORS[docType];
    return generator(filePath, existingMeta, getTodayDate());
}
export class MigrateCommand {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async run(options) {
        // Log dry-run message if applicable
        if (options.dryRun) {
            this.deps.logger.info('Running in dry-run mode - no files will be modified');
        }
        // Log start message
        this.deps.logger.info('Migrating documentation files...');
        // Get files to migrate
        const files = await this.getFilesToMigrate(options);
        // Return early if no files (exit 0)
        if (!files.length) {
            this.deps.logger.warn('No files found to migrate');
            return 0;
        }
        // Log file count
        this.deps.logger.info(`Found ${files.length} file(s) to process`);
        // Migrate all files
        const results = [];
        for (const file of files) {
            const result = await this.migrateFile(file, options);
            results.push(result);
        }
        // Format results
        this.formatResults(results);
        // Return exit code (1 if errors, 0 otherwise)
        const hasErrors = results.some((r) => r.action === 'error');
        return hasErrors ? 1 : 0;
    }
    async getFilesToMigrate(options) {
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
    async migrateFile(filePath, options) {
        const relativePath = relative(this.deps.process.cwd(), filePath);
        const planningPathViolation = getNonCanonicalPlanningPathViolation(relativePath);
        if (planningPathViolation) {
            return {
                file: relativePath,
                action: 'error',
                docType: 'unknown',
                message: planningPathViolation,
            };
        }
        try {
            const content = await this.deps.fs.readFile(filePath);
            const parsed = parseFrontmatter(content);
            const normalizedPath = relativePath.replace(/^(\.\.[\\/])+/, '');
            const docType = detectDocType(normalizedPath);
            // Skip if has frontmatter and not force
            if (parsed.hasFrontmatter && !options.force) {
                return this.createSkippedResult(relativePath, docType, options);
            }
            const { existingMeta, contentToUse } = this.extractExistingMetadata(content, parsed, relativePath, options);
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
                action: parsed.hasFrontmatter ? 'updated' : 'added',
                docType,
            };
        }
        catch (error) {
            return {
                file: relativePath,
                action: 'error',
                docType: 'unknown',
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }
    createSkippedResult(relativePath, docType, options) {
        if (options.verbose) {
            this.deps.logger.debug(`${relativePath}: already has frontmatter, skipping`);
        }
        return {
            file: relativePath,
            action: 'skipped',
            docType,
            message: 'Already has frontmatter',
        };
    }
    extractExistingMetadata(content, parsed, relativePath, options) {
        let existingMeta = {};
        let contentToUse = content;
        if (hasBoldMetadata(content)) {
            const { metadata, contentWithoutMetadata } = parseBoldMetadata(content);
            existingMeta = normalizeBoldMetadata(metadata);
            contentToUse = contentWithoutMetadata;
            if (options.verbose) {
                this.deps.logger.debug(`${relativePath}: found bold metadata: ${JSON.stringify(existingMeta)}`);
            }
        }
        else if (!parsed.hasFrontmatter) {
            this.deps.logger.warn(`${relativePath}: No metadata found, using defaults`);
        }
        if (parsed.hasFrontmatter) {
            existingMeta = { ...existingMeta, ...parsed.frontmatter };
            contentToUse = parsed.content;
        }
        return { existingMeta, contentToUse };
    }
    handleDryRun(relativePath, docType, newFrontmatter, hadFrontmatter) {
        this.deps.logger.info(`[DRY RUN] ${relativePath}`);
        this.deps.logger.info(`  Type: ${docType}`);
        this.deps.logger.info(`  Frontmatter: ${JSON.stringify(newFrontmatter)}`);
        return {
            file: relativePath,
            action: hadFrontmatter ? 'updated' : 'added',
            docType,
            message: 'Would add frontmatter',
        };
    }
    async handleBackup(filePath, relativePath, options) {
        if (!options.backup)
            return;
        const backupPath = `${filePath}.bak`;
        if (this.deps.fs.existsSync(backupPath)) {
            this.deps.logger.warn(`${relativePath}: Backup already exists, skipping backup creation`);
        }
        else {
            await this.deps.fs.copyFile(filePath, backupPath);
        }
    }
    formatResults(results) {
        // Count added/updated/skipped/errors
        const added = results.filter((r) => r.action === 'added');
        const updated = results.filter((r) => r.action === 'updated');
        const skipped = results.filter((r) => r.action === 'skipped');
        const errors = results.filter((r) => r.action === 'error');
        // Log summary
        this.deps.logger.success(`Migration complete - Added: ${added.length}, Updated: ${updated.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`);
        // Log errors if any
        if (errors.length > 0) {
            for (const error of errors) {
                this.deps.logger.error(`${error.file}: ${error.message}`);
            }
        }
    }
}
export function createMigrateCommand() {
    return new MigrateCommand({
        fs: {
            readFile: (path) => readFile(path, 'utf-8'),
            writeFile: (path, content) => writeFile(path, content, 'utf-8'),
            copyFile: (src, dest) => copyFile(src, dest),
            existsSync: (path) => existsSync(path),
        },
        logger: consola,
        process: {
            cwd: () => process.cwd(),
            exit: (code) => process.exit(code),
            execSync: () => '',
        },
        glob: (patterns, opts) => glob(patterns, opts),
    });
}
