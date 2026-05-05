import type { PlanComplexity } from '#core/schema';
import { type Blueprint } from '#core/parser';
export interface CreateBlueprintDraftInput {
    complexity: PlanComplexity;
    goal: string;
}
export interface CompiledBlueprintDraft {
    complexity: PlanComplexity;
    markdown: string;
    outputPath: string;
    path: string;
    projectRoot: string;
    relativeFilePath: string;
    slug: string;
    status: 'draft';
    title: string;
}
export interface CreatedBlueprintDraft extends CompiledBlueprintDraft {
    blueprint: Blueprint;
}
export interface BlueprintCreationServiceOptions {
    projectRoot?: string;
    now?: () => Date;
    templatePath?: string;
}
export type CreateBlueprintInput = CreateBlueprintDraftInput;
export type BlueprintDraft = CompiledBlueprintDraft;
export type CreatedBlueprint = CreatedBlueprintDraft;
export declare class BlueprintCreationService {
    private readonly now;
    private readonly projectRoot;
    private readonly templatePath;
    constructor(projectRoot: string, options?: BlueprintCreationServiceOptions);
    constructor(options: BlueprintCreationServiceOptions & {
        projectRoot: string;
    });
    compile(input: CreateBlueprintDraftInput): Promise<CompiledBlueprintDraft>;
    compileDraft(input: CreateBlueprintDraftInput): Promise<CompiledBlueprintDraft>;
    create(input: CreateBlueprintDraftInput): Promise<CreatedBlueprintDraft>;
    private resolveCollisionSafeSlug;
}
//# sourceMappingURL=BlueprintCreationService.d.ts.map