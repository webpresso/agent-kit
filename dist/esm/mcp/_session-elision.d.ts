import { type SessionElision, type SessionElisionKind } from './_session-elision-schema.js';
export { WP_SESSION_RETRIEVE_TOOL_NAME, sessionElisionKindSchema, sessionElisionSchema, type SessionElision, type SessionElisionKind, } from './_session-elision-schema.js';
export interface SessionElisionRecordInput {
    readonly source: string;
    readonly kind: SessionElisionKind;
    readonly text: string;
    readonly returnedText?: string;
    readonly rawBytes?: number;
    readonly returnedBytes?: number;
    readonly metadata?: Record<string, unknown>;
}
export interface SessionElisionRecordResult {
    readonly elision?: SessionElision;
    readonly warning?: string;
}
export interface SessionElisionRecorder {
    record(input: SessionElisionRecordInput): SessionElisionRecordResult;
}
export declare function createNoopSessionElisionRecorder(): SessionElisionRecorder;
export declare function contentHashElisionId(text: string): string;
export declare function createSessionElisionRecorder(options: {
    readonly cwd?: string;
    readonly sourcePrefix: string;
    readonly dbPath?: string;
}): SessionElisionRecorder;
//# sourceMappingURL=_session-elision.d.ts.map