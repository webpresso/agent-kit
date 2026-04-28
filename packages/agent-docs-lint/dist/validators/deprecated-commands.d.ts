import type { ValidationError } from '#types';
/**
 * Validate that bash code blocks don't use deprecated command syntax.
 *
 * Enforces the "just-first" philosophy by catching positional argument usage
 * and direct tool invocations that should use flag-based just recipes instead.
 */
export declare function validateDeprecatedCommands(filePath: string, content: string): ValidationError[];
