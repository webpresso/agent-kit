import { type TrustDossierViolation } from "./dossier.js";
export type BlueprintTrustStatus = "draft" | "planned" | "in-progress" | "completed";
export type ValidateBlueprintTrustInput = {
    repoRoot: string;
    file: string;
    status: BlueprintTrustStatus;
    markdown: string;
    promotionCandidate?: boolean;
    requirePassingGates?: boolean;
    scanTaskAmbiguity?: boolean;
};
export type BlueprintTrustViolation = TrustDossierViolation & {
    file: string;
};
export declare function validateBlueprintTrust(input: ValidateBlueprintTrustInput): {
    ok: boolean;
    violations: BlueprintTrustViolation[];
};
//# sourceMappingURL=validator.d.ts.map