import type { PretoolLogReadResult } from "./read-pretool-log.js";
export interface EvidenceGapRecord {
    kind: "no-pretool-evidence" | "unreadable-or-unparsed-evidence";
    message: string;
    candidateFiles: string[];
    warnings: string[];
}
export declare function detectEvidenceGap(readResult: PretoolLogReadResult): EvidenceGapRecord | null;
//# sourceMappingURL=evidence-gap.d.ts.map