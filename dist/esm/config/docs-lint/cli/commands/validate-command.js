import { glob } from 'glob';
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { getNonCanonicalPlanningPathViolation } from '#config/docs-lint/cli/planning-path';
import { validateCommandSafety } from '#config/docs-lint/cli/validators/command-safety';
import { validateContextLimits } from '#config/docs-lint/cli/validators/context-limits';
import { validateDeprecatedCommands } from '#config/docs-lint/cli/validators/deprecated-commands';
import { validateFilename } from '#config/docs-lint/cli/validators/filename';
import { validateImports } from '#config/docs-lint/cli/validators/imports';
import { validateLinks } from '#config/docs-lint/cli/validators/links';
import { validateMarkdownlint } from '#config/docs-lint/cli/validators/markdownlint';
import { validateStructure } from '#config/docs-lint/cli/validators/structure';
import { parseFrontmatter } from '#config/docs-lint/parsers/frontmatter';
import { detectDocType, getConfig, getSchema, normalizeDocType, } from '#config/docs-lint/schemas/index';
/** Doc types that don't require frontmatter (context files, research, unknown) */
const FRONTMATTER_OPTIONAL_TYPES = new Set(['guide', 'research', 'unknown']);
const DEFAULT_PATTERNS = [
    'docs/**/*.md',
    '.agent/**/*.md',
    'webpresso/blueprints/**/*.md',
    'webpresso/tech-debt/**/*.md',
    'CLAUDE.md',
    'README.md',
];
const IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    '**/vale/styles/**',
    '**/.*/**',
    // Test fixtures (intentionally invalid for testing)
    '**/__fixtures__/**',
];
export class ValidateCommand {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async run(options) {
        this.deps.logger.info('Validating documentation...');
        const files = await this.getFilesToValidate(options);
        if (!files.length) {
            this.deps.logger.info('No files to validate');
            return 0;
        }
        if (options.verbose) {
            this.deps.logger.info(`Found ${files.length} file(s) to validate`);
        }
        const results = await this.validateFiles(files, options);
        this.formatResults(results);
        const hasErrors = results.some((r) => r.errors.length > 0);
        return hasErrors ? 1 : 0;
    }
    async getFilesToValidate(options) {
        if (options.files && options.files.length > 0) {
            // Convert relative paths to absolute paths
            const cwd = this.deps.process.cwd();
            return options.files.map((f) => {
                // If already absolute, return as-is
                if (f.startsWith('/'))
                    return f;
                // Otherwise, make it absolute
                return `${cwd}/${f}`;
            });
        }
        if (options.staged) {
            // Get staged files from git
            const output = this.deps.process.execSync('git diff --cached --name-only --diff-filter=ACM', {
                encoding: 'utf-8',
            });
            return output
                .split('\n')
                .filter((f) => f.endsWith('.md'))
                .filter((f) => !IGNORE_PATTERNS.some((pattern) => {
                const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
                return regex.test(f);
            }))
                .filter(Boolean);
        }
        // Default: glob all markdown files
        return await this.deps.glob(DEFAULT_PATTERNS, {
            ignore: IGNORE_PATTERNS,
            cwd: this.deps.process.cwd(),
            absolute: true,
        });
    }
    async validateFiles(files, options) {
        const results = [];
        const total = files.length;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relativePath = relative(this.deps.process.cwd(), file);
            this.deps.logger.debug(`[${i + 1}/${total}] ${relativePath}`);
            const result = await this.validateFile(file, options);
            results.push(result);
        }
        return results;
    }
    async validateFile(filePath, options) {
        const relativePath = relative(this.deps.process.cwd(), filePath);
        const planningPathViolation = getNonCanonicalPlanningPathViolation(relativePath);
        if (planningPathViolation) {
            return {
                file: relativePath,
                errors: [
                    {
                        file: relativePath,
                        severity: 'error',
                        source: 'structure',
                        message: planningPathViolation,
                    },
                ],
                warnings: [],
                valid: false,
            };
        }
        try {
            const content = await this.deps.fs.readFile(filePath);
            const parsed = parseFrontmatter(content);
            const docTypeResult = this.resolveDocType(parsed.frontmatter.type, relativePath);
            if ('error' in docTypeResult) {
                return docTypeResult.error;
            }
            const docType = docTypeResult.docType;
            if (options.verbose) {
                this.deps.logger.debug(`${relativePath}: type=${docType}`);
            }
            const frontmatterResult = this.validateFrontmatter(parsed, docType, relativePath);
            const structureResult = this.validateRequiredSections(parsed.content, docType, relativePath);
            const contentResult = await this.runContentValidators(filePath, content, relativePath, docType, options);
            const { errors, warnings } = this.mergeResults(frontmatterResult, structureResult, contentResult);
            return {
                file: relativePath,
                errors,
                warnings,
                valid: !errors.length,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                file: relativePath,
                errors: [
                    {
                        file: relativePath,
                        severity: 'error',
                        source: 'schema',
                        message: `Failed to read file: ${message}`,
                    },
                ],
                warnings: [],
                valid: false,
            };
        }
    }
    resolveDocType(explicitType, relativePath) {
        // If no explicit type, detect from path
        if (!explicitType) {
            return { docType: detectDocType(relativePath) };
        }
        if (typeof explicitType === 'string') {
            const normalized = normalizeDocType(explicitType);
            // Unrecognized frontmatter `type` values become `unknown` (strict; no aliases).
            return { docType: normalized };
        }
        return {
            error: {
                file: relativePath,
                errors: [
                    {
                        file: relativePath,
                        line: 1,
                        severity: 'error',
                        source: 'schema',
                        message: `Invalid document type: ${explicitType}`,
                        ruleId: 'invalid-doc-type',
                    },
                ],
                warnings: [],
                valid: false,
            },
        };
    }
    validateFrontmatter(parsed, docType, relativePath) {
        // Frontmatter-optional types: only validate if present
        if (FRONTMATTER_OPTIONAL_TYPES.has(docType)) {
            if (!parsed.hasFrontmatter) {
                return { errors: [], warnings: [] };
            }
            return {
                errors: this.validateFrontmatterSchema(parsed.frontmatter, docType, relativePath),
                warnings: [],
            };
        }
        // All other types (including unknown): frontmatter required
        if (!parsed.hasFrontmatter) {
            return {
                errors: [
                    {
                        file: relativePath,
                        line: 1,
                        severity: 'error',
                        source: 'schema',
                        message: 'Missing YAML frontmatter',
                        ruleId: 'frontmatter-required',
                    },
                ],
                warnings: [],
            };
        }
        // Unknown types: skip schema validation with warning
        if (docType === 'unknown') {
            return {
                errors: [],
                warnings: [
                    {
                        file: relativePath,
                        severity: 'warning',
                        source: 'schema',
                        message: 'Unknown document type - skipping schema validation',
                    },
                ],
            };
        }
        // Validate schema for known types
        return {
            errors: this.validateFrontmatterSchema(parsed.frontmatter, docType, relativePath),
            warnings: [],
        };
    }
    validateFrontmatterSchema(frontmatter, docType, relativePath) {
        const schema = getSchema(docType);
        const result = schema.safeParse(frontmatter);
        if (result.success) {
            return [];
        }
        return this.zodErrorsToValidationErrors(result.error, relativePath);
    }
    zodErrorsToValidationErrors(zodError, relativePath) {
        return zodError.issues.map((issue) => ({
            file: relativePath,
            line: 1,
            severity: 'error',
            source: 'schema',
            message: `${issue.path.join('.')}: ${issue.message}`,
            ruleId: 'frontmatter-schema',
        }));
    }
    validateRequiredSections(content, docType, relativePath) {
        // Skip for unknown or frontmatter-optional types
        if (docType === 'unknown' || FRONTMATTER_OPTIONAL_TYPES.has(docType)) {
            return { errors: [], warnings: [] };
        }
        const config = getConfig(docType);
        if (!config?.requiredSections) {
            return { errors: [], warnings: [] };
        }
        const structureResults = validateStructure(content, config.requiredSections, relativePath);
        return this.partitionBySeverity(structureResults);
    }
    async runContentValidators(filePath, content, relativePath, _docType, options) {
        const markdownlintResult = validateMarkdownlint(filePath, content, options.fix);
        // Write fixed content back to file if fixes were applied
        if (markdownlintResult.fixedContent &&
            options.fix &&
            markdownlintResult.fixedContent !== content) {
            this.deps.logger.debug(`[fix] Writing fixes to ${filePath}`);
            await this.deps.fs.writeFile(filePath, markdownlintResult.fixedContent);
        }
        const filenameResults = validateFilename(relativePath);
        const contextResults = validateContextLimits(relativePath, content);
        const importResults = validateImports(relativePath, content, this.deps.process.cwd());
        const commandResults = validateCommandSafety(relativePath, content);
        const deprecatedCommandResults = validateDeprecatedCommands(relativePath, content);
        const linkResults = validateLinks(filePath, content);
        const allResults = [
            ...markdownlintResult.errors,
            ...filenameResults,
            ...contextResults,
            ...importResults,
            ...commandResults,
            ...deprecatedCommandResults,
            ...linkResults,
        ];
        return this.partitionBySeverity(allResults);
    }
    partitionBySeverity(results) {
        return {
            errors: results.filter((e) => e.severity === 'error'),
            warnings: results.filter((e) => e.severity === 'warning'),
        };
    }
    mergeResults(...results) {
        return {
            errors: results.flatMap((r) => r.errors),
            warnings: results.flatMap((r) => r.warnings),
        };
    }
    formatError(error) {
        const location = error.line ? `:${error.line}` : '';
        const rule = error.ruleId ? ` (${error.ruleId})` : '';
        return `  ${location} ${error.message}${rule}`;
    }
    formatFileResults(result) {
        if (!result.errors.length && !result.warnings.length) {
            return { errorCount: 0, warningCount: 0 };
        }
        this.deps.logger.log('');
        this.deps.logger.log(result.file);
        for (const error of result.errors) {
            this.deps.logger.error(this.formatError(error));
        }
        for (const warning of result.warnings) {
            this.deps.logger.warn(this.formatError(warning));
        }
        return { errorCount: result.errors.length, warningCount: result.warnings.length };
    }
    formatResults(results) {
        let totalErrors = 0;
        let totalWarnings = 0;
        for (const result of results) {
            const { errorCount, warningCount } = this.formatFileResults(result);
            totalErrors += errorCount;
            totalWarnings += warningCount;
        }
        this.deps.logger.log('');
        if (totalErrors > 0 || totalWarnings > 0) {
            this.deps.logger.log(`Validation: ${totalErrors} error(s), ${totalWarnings} warning(s)`);
        }
        else {
            this.deps.logger.success('All documents are valid');
        }
    }
}
const consoleLogger = {
    info: (msg) => console.info(msg),
    success: (msg) => console.info(msg),
    error: (msg) => console.error(msg),
    warn: (msg) => console.warn(msg),
    debug: (msg) => console.debug(msg),
    log: (msg) => console.log(msg),
};
export function createValidateCommand(deps) {
    const resolvedDeps = deps ?? {
        fs: {
            readFile: (path) => readFile(path, 'utf-8'),
            writeFile: (path, content) => writeFile(path, content, 'utf-8'),
            copyFile: () => Promise.resolve(),
            existsSync: () => true,
        },
        logger: consoleLogger,
        process: {
            cwd: () => process.cwd(),
            exit: (code) => process.exit(code),
            execSync: (cmd, opts) => execSync(cmd, opts).toString(),
        },
        glob: async (patterns, opts) => (await glob(patterns, opts)).map(String),
    };
    return new ValidateCommand(resolvedDeps);
}
//# sourceMappingURL=validate-command.js.map