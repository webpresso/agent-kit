import { z } from 'zod';
declare const overlayManifestSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    cli: z.ZodString;
    surfaces: z.ZodArray<z.ZodString>;
    evidence: z.ZodArray<z.ZodString>;
    files: z.ZodDefault<z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type AgentOverlayManifest = z.infer<typeof overlayManifestSchema>;
export interface LoadedAgentOverlay extends AgentOverlayManifest {
    manifestPath: string;
    rootPath: string;
}
export interface AgentOverlayValidationResult {
    ok: boolean;
    overlays: LoadedAgentOverlay[];
    violations: Array<{
        file?: string;
        message: string;
    }>;
}
export declare function loadAgentOverlays(rootDirectory?: string): LoadedAgentOverlay[];
export declare function validateAgentOverlays(rootDirectory?: string): AgentOverlayValidationResult;
export {};
//# sourceMappingURL=overlay-loader.d.ts.map