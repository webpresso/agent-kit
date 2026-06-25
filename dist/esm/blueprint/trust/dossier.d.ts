export type TrustReadinessVerdict = {
    promotionReady: boolean;
    unresolvedCount: number;
    verifiedAt: string;
    verifiedHead: string;
    trustGateVersion: string;
};
export type TrustMaterialClaim = {
    id: string;
    claim: string;
    evidence: string;
};
export type TrustMaterialDecision = {
    id: string;
    decision: string;
    chosenOption: string;
    rejectedAlternatives: string;
    rationale: string;
};
export type TrustPromotionGate = {
    gate: string;
    command: string;
    expectedOutcome: string;
    lastResult: string;
};
export type TrustDossier = {
    readiness: TrustReadinessVerdict;
    claims: TrustMaterialClaim[];
    decisions: TrustMaterialDecision[];
    gates: TrustPromotionGate[];
    residualUnknowns: string;
};
export type TrustDossierViolation = {
    section: string;
    claimId?: string;
    message: string;
};
export declare function parseTrustDossier(markdown: string): {
    dossier?: TrustDossier;
    violations: TrustDossierViolation[];
};
export declare function stripFencedCodeBlocks(markdown: string): string;
//# sourceMappingURL=dossier.d.ts.map