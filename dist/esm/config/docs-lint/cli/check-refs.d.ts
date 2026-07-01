#!/usr/bin/env bun
/**
 * Dead Reference Detection
 *
 * Finds documentation that references code files that no longer exist.
 * Helps identify stale docs that need updating after code refactors.
 */
interface DeadRef {
    docFile: string;
    line: number;
    reference: string;
    type: "file" | "directory";
}
export declare function validateFile(file: string): DeadRef[];
export {};
//# sourceMappingURL=check-refs.d.ts.map