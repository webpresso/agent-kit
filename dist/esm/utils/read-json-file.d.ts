import type { z } from "zod";
/**
 * Read repo-owned JSON whose shape is already constrained by the owning caller.
 * Prefer readJsonFileWithSchema for user input, persisted config, and tool payloads.
 */
export declare function readTrustedJsonFile<T>(path: string): T;
export declare function readJsonFileWithSchema<T>(path: string, schema: z.ZodType<T>): T;
//# sourceMappingURL=read-json-file.d.ts.map