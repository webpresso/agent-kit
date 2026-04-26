#!/usr/bin/env node
import type { ToolInput } from '../shared/types.js';
export declare const LINTABLE_EXTENSIONS: readonly [".ts", ".tsx", ".js", ".jsx", ".json", ".css"];
export declare const SKIP_PATTERNS: readonly RegExp[];
export declare function isLintableFile(filePath: string): boolean;
export declare function isSkippedPath(filePath: string): boolean;
export declare function shouldLintFile(input: ToolInput): boolean;
export declare function lintFile(filePath: string, projectDir: string): boolean;
export declare function processPostToolUse(input: ToolInput, projectDir: string): boolean;
//# sourceMappingURL=lint-after-edit.d.ts.map