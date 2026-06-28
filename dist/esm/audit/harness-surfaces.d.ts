import { z } from "zod";
import type { RepoAuditResult } from "./repo-guardrails.js";
export declare const HARNESS_SURFACES_MANIFEST_PATH = "catalog/agent/harness-surfaces.yaml";
export declare const HARNESS_GATE_WORKFLOW_PATH = ".github/workflows/harness-gate.yml";
export declare const harnessSurfacePathSchema: z.ZodObject<{
    path: z.ZodString;
    status: z.ZodEnum<{
        concrete: "concrete";
        projected: "projected";
    }>;
}, z.core.$strict>;
export declare const harnessSurfaceSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    owner: z.ZodEnum<{
        "agent-kit": "agent-kit";
        "oh-my-codex": "oh-my-codex";
    }>;
    kind: z.ZodEnum<{
        policy: "policy";
        hook: "hook";
        "generated-surface": "generated-surface";
        "runtime-state": "runtime-state";
        "regression-gate": "regression-gate";
        overlay: "overlay";
        "secret-gate": "secret-gate";
    }>;
    lifecycle: z.ZodEnum<{
        locked: "locked";
        governed: "governed";
        experimental: "experimental";
    }>;
    paths: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        status: z.ZodEnum<{
            concrete: "concrete";
            projected: "projected";
        }>;
    }, z.core.$strict>>;
    triggers: z.ZodArray<z.ZodString>;
    evidence: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const harnessSurfacesManifestSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    surfaces: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        owner: z.ZodEnum<{
            "agent-kit": "agent-kit";
            "oh-my-codex": "oh-my-codex";
        }>;
        kind: z.ZodEnum<{
            policy: "policy";
            hook: "hook";
            "generated-surface": "generated-surface";
            "runtime-state": "runtime-state";
            "regression-gate": "regression-gate";
            overlay: "overlay";
            "secret-gate": "secret-gate";
        }>;
        lifecycle: z.ZodEnum<{
            locked: "locked";
            governed: "governed";
            experimental: "experimental";
        }>;
        paths: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            status: z.ZodEnum<{
                concrete: "concrete";
                projected: "projected";
            }>;
        }, z.core.$strict>>;
        triggers: z.ZodArray<z.ZodString>;
        evidence: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type HarnessSurfacePath = z.infer<typeof harnessSurfacePathSchema>;
export type HarnessSurface = z.infer<typeof harnessSurfaceSchema>;
export type HarnessSurfacesManifest = z.infer<typeof harnessSurfacesManifestSchema>;
export interface ReadHarnessSurfacesOptions {
    manifestPath?: string;
}
export declare function readHarnessSurfacesManifest(rootDirectory?: string, options?: ReadHarnessSurfacesOptions): HarnessSurfacesManifest;
export declare function auditHarnessSurfaces(rootDirectory?: string, options?: ReadHarnessSurfacesOptions): RepoAuditResult;
//# sourceMappingURL=harness-surfaces.d.ts.map