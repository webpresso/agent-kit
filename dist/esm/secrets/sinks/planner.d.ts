import { type SecretsSchema } from "#secrets/config/schema.js";
import { type ResolvedSecretSinkPlan, type SecretSinkPlanInput } from "#secrets/sinks/types.js";
export interface ResolveSecretSinkInput extends SecretSinkPlanInput {
}
export interface ResolveSecretSinkOptions extends ResolveSecretSinkInput {
    readonly config: SecretsSchema | unknown;
}
export declare function resolveSecretSink(schema: SecretsSchema, input: ResolveSecretSinkInput): ResolvedSecretSinkPlan;
export declare function resolveSecretSink(input: ResolveSecretSinkOptions): ResolvedSecretSinkPlan;
//# sourceMappingURL=planner.d.ts.map