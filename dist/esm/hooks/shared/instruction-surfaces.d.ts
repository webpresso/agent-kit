export declare const INSTRUCTION_SURFACE_HOSTS: readonly ["claude", "codex", "cursor", "opencode"];
export type InstructionSurfaceHost = (typeof INSTRUCTION_SURFACE_HOSTS)[number];
export type InstructionSurfaceInput = {
    readonly host: InstructionSurfaceHost;
    readonly projectRoutingMarkdown?: string | null;
    readonly extraSections?: readonly (string | null | undefined)[];
    readonly includeEnvelope?: boolean;
    readonly includeRoutingContent?: boolean;
};
export type InstructionSurface = {
    readonly host: InstructionSurfaceHost;
    readonly artifactName: string;
    readonly content: string;
};
export declare function routingToolNamesFromSource(content: string): readonly string[];
export declare function renderInstructionSurface(input: InstructionSurfaceInput): InstructionSurface;
export declare function renderSessionStartInstructionContext(input: {
    readonly projectRoutingMarkdown?: string | null;
    readonly extraSections?: readonly (string | null | undefined)[];
}): string;
//# sourceMappingURL=instruction-surfaces.d.ts.map