import type { ValidationError } from "#config/docs-lint/index";
/**
 * Validate command safety in markdown files
 *
 * Detects dangerous bash patterns that could be harmful if executed.
 * Helps prevent accidental inclusion of destructive commands in docs.
 *
 * Inspired by @felixgeelhaar/cclint
 */
export declare function validateCommandSafety(filePath: string, content: string): ValidationError[];
/**
 * Check if a specific command is safe
 * Utility for programmatic use
 */
export declare function isCommandSafe(command: string): {
    safe: boolean;
    issues: string[];
};
//# sourceMappingURL=command-safety.d.ts.map