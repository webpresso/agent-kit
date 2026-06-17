import { type WriteFileOptions } from 'node:fs';
export interface WriteJsonFileOptions {
    readonly indent?: number;
    readonly trailingNewline?: boolean;
    readonly writeFileOptions?: WriteFileOptions;
}
export declare function writeJsonFile(path: string, data: unknown, options?: WriteJsonFileOptions): void;
//# sourceMappingURL=write-json-file.d.ts.map