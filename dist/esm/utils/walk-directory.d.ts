import { type Dirent } from 'node:fs';
export interface WalkDirectoryOptions {
    readonly extensions?: readonly string[];
    readonly skipDirs?: readonly string[];
    readonly filter?: (entry: {
        path: string;
        relativePath: string;
        dirent: Dirent;
    }) => boolean;
    readonly absolute?: boolean;
}
export declare function walkDirectory(root: string, options?: WalkDirectoryOptions): string[];
//# sourceMappingURL=walk-directory.d.ts.map