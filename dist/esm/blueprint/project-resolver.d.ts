import { type BlueprintProjectRef, type ResolveBlueprintProjectsOptions } from '#projects.js';
export interface ResolveProjectTarget {
    readonly cwd: string;
    readonly projectId?: string;
    readonly discovery?: Omit<ResolveBlueprintProjectsOptions, 'cwd'>;
}
export type ResolveProjectResult = {
    readonly ok: true;
    readonly cwd: string;
    readonly project_id: string | null;
} | {
    readonly ok: false;
    readonly reason: 'not_found' | 'ambiguous';
    readonly summary: string;
    readonly hint: string;
    readonly candidates: readonly BlueprintProjectRef[];
};
export interface ProjectResolver {
    listVisibleProjects(options: ResolveBlueprintProjectsOptions): Promise<readonly BlueprintProjectRef[]>;
    resolve(target: ResolveProjectTarget): Promise<ResolveProjectResult>;
    warm(projects: readonly BlueprintProjectRef[]): void;
    invalidate(): void;
}
interface CreateProjectResolverOptions {
    readonly ttlMs?: number;
    readonly now?: () => number;
    readonly resolveProjects?: (options: ResolveBlueprintProjectsOptions) => Promise<readonly BlueprintProjectRef[]>;
}
export declare function createProjectResolver(options?: CreateProjectResolverOptions): ProjectResolver;
export {};
//# sourceMappingURL=project-resolver.d.ts.map