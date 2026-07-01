import type { ToolHandler, ToolHandlerResult, ToolRegistrar } from "./auto-discover.js";
export type RegisteredTool = {
    name: string;
    handler: ToolHandler;
};
export type ToolMap = Map<string, RegisteredTool>;
export interface BlueprintFixture {
    readonly stateDir: string;
    readonly slug: string;
    readonly content: string;
}
export declare function makeRegistrar(): {
    registrar: ToolRegistrar;
    tools: ToolMap;
};
export declare function callTool(tools: ToolMap, name: string, input: unknown): Promise<ToolHandlerResult>;
export declare function parseResult<T = unknown>(result: ToolHandlerResult): T;
export declare function createTempBlueprintRepo(prefix?: string): string;
export declare function trustDossierFixture(evidence?: string): string;
export declare function approvalFrontmatterFixture(): string;
export declare function withApprovalFrontmatter(content: string): string;
export declare function writeApprovalLedgerFixture(cwd: string, stateDir: string, slug: string): string;
export declare function writeBlueprintFixture(cwd: string, fixture: BlueprintFixture): {
    overviewPath: string;
};
export declare function registerBlueprintToolMap(cwd: string): Promise<ToolMap>;
export declare function makeLazyBlueprintHarness(prefix?: string): Promise<{
    tmpDir: string;
    tools: ToolMap;
}>;
export declare function createEmptyBlueprintProjection(cwd: string): string;
export declare function makeEmptyProjectionBlueprintHarness(prefix?: string): Promise<{
    tmpDir: string;
    tools: ToolMap;
}>;
export declare function makeProjectionBackedBlueprintHarness(prefix: string, fixtures: readonly BlueprintFixture[]): Promise<{
    tmpDir: string;
    tools: ToolMap;
    overviewPaths: string[];
}>;
export declare function bootstrapBlueprintProjection(cwd: string): Promise<string>;
export declare function cleanupTempDir(dir: string | undefined): void;
export declare function markBlueprintValidated(cwd: string, slug: string, timestamp?: number): void;
export declare function writeStaleProjectionMetadata(cwd: string): void;
export declare function makeLocalBlueprintRepo(slug: string, content?: string): {
    dir: string;
    overviewPath: string;
};
export declare const VALID_BLUEPRINT = "---\ntype: blueprint\ntitle: My Feature Blueprint\nstatus: draft\ncomplexity: M\nowner: alice\ncreated: '2026-01-15'\nlast_updated: '2026-04-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** Phase 1 \u2014 ship feature X\n- **Consuming surface:** /dashboard route\n- **New user-visible capability:** Users can see feature X on the dashboard.\n\n## Summary\n\nA well-formed blueprint for testing.\n\n#### Task 1.1: Do the thing\n\n**Status:** todo\n**Wave:** 0\n\n**Acceptance:**\n- [ ] The thing is done\n";
export declare const INVALID_BLUEPRINT_MISSING_WEDGE = "---\ntype: blueprint\ntitle: Bad Blueprint\nstatus: draft\ncomplexity: M\nowner: alice\ncreated: '2026-01-15'\nlast_updated: '2026-04-01'\n---\n\n## Summary\n\nThis blueprint is missing the product wedge anchor and task acceptance.\n\n#### Task 1.1: Do the thing\n\n**Status:** todo\n";
export declare const INVALID_BLUEPRINT_NO_TASKS = "---\ntype: blueprint\ntitle: No Tasks Blueprint\nstatus: draft\ncomplexity: S\nowner: bob\ncreated: '2026-01-15'\nlast_updated: '2026-04-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** something\n- **Consuming surface:** /somewhere\n- **New user-visible capability:** something\n\n## Summary\n\nBlueprint with no task sections at all.\n";
export declare const INVALID_BLUEPRINT_MISSING_FRONTMATTER = "---\ntype: blueprint\ntitle: ''\nstatus: draft\ncomplexity: M\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** x\n- **Consuming surface:** /x\n- **New user-visible capability:** x\n\n#### Task 1.1: A task\n\n**Status:** todo\n\n**Acceptance:**\n- [ ] something\n";
//# sourceMappingURL=blueprint-server.test-harness.d.ts.map