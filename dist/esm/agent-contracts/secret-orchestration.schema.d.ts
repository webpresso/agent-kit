import { z } from 'zod';
export declare const secretDoctorOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    code: z.ZodLiteral<"WP_SECRETS_DOCTOR_OK">;
    profile: z.ZodString;
    sink: z.ZodString;
    plan: z.ZodObject<{
        sink: z.ZodString;
        op: z.ZodString;
        profile: z.ZodString;
        provider: z.ZodString;
        environment: z.ZodString;
        runtimeProfile: z.ZodString;
        docsPath: z.ZodString;
        requiresBootstrap: z.ZodBoolean;
    }, z.core.$strip>;
    doctor: z.ZodObject<{
        ok: z.ZodBoolean;
        code: z.ZodString;
        problem: z.ZodString;
        fix: z.ZodOptional<z.ZodString>;
        evidence: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const secretPreviewOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    code: z.ZodLiteral<"WP_PREVIEW_PLAN_READY">;
    sinkPlan: z.ZodObject<{
        provider: z.ZodString;
        environment: z.ZodString;
    }, z.core.$strip>;
    deployPlan: z.ZodUnknown;
}, z.core.$strip>;
export declare const secretBootstrapOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    code: z.ZodEnum<{
        WP_GITHUB_BOOTSTRAP_PLANNED: "WP_GITHUB_BOOTSTRAP_PLANNED";
        WP_GITHUB_BOOTSTRAP_APPLIED: "WP_GITHUB_BOOTSTRAP_APPLIED";
    }>;
    plan: z.ZodObject<{
        mode: z.ZodString;
        lanes: z.ZodArray<z.ZodString>;
        requiredSecrets: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    applied: z.ZodBoolean;
}, z.core.$strip>;
export declare const secretCleanupOutputSchema: z.ZodObject<{
    lane: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const secretMigrationOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    code: z.ZodLiteral<"WP_MIGRATE_SECRETS_PATCH_PLAN">;
    patches: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        action: z.ZodEnum<{
            replace: "replace";
            delete: "delete";
            "remove-dependency": "remove-dependency";
        }>;
        reason: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
//# sourceMappingURL=secret-orchestration.schema.d.ts.map