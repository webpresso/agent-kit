import type { SectionDirective } from './directives.schema.js';
export interface RotationLogEntry {
    readonly sectionSlug: string;
    readonly archiveTo: string;
    readonly reason: string;
    readonly timestamp: string;
}
export interface DirectiveContext {
    readonly dryRun: boolean;
    readonly isShallowClone: boolean;
    readonly rotationLog: RotationLogEntry[];
    readonly warnings: string[];
    readonly cwd?: string;
    readonly filePath?: string;
}
export declare function applyDirectives(sections: Map<string, {
    heading: string;
    content: string;
}>, directives: readonly SectionDirective[], context: DirectiveContext): Map<string, {
    heading: string;
    content: string;
}>;
//# sourceMappingURL=directives.d.ts.map