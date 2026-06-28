import { type ParsedLogLine } from "#hooks/pretool-guard/logger";
export interface PretoolLogRecord extends ParsedLogLine {
    sourceFile: string;
    lineNumber: number;
}
export interface PretoolLogReadResult {
    records: PretoolLogRecord[];
    candidateFiles: string[];
    warnings: string[];
}
export interface ReadPretoolEvidenceOptions {
    logFiles?: readonly string[];
    maxFiles?: number;
    maxBytesPerFile?: number;
    maxDirectories?: number;
    maxDepth?: number;
}
export declare function readPretoolEvidence(rootDirectory?: string, options?: ReadPretoolEvidenceOptions): PretoolLogReadResult;
//# sourceMappingURL=read-pretool-log.d.ts.map