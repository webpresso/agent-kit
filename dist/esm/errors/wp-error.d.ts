export interface WpErrorEnvelope {
    readonly code: string;
    readonly problem: string;
    readonly cause: string;
    readonly fix: string;
    readonly docsUrl: string;
    readonly evidence: unknown;
    readonly redacted: boolean;
}
export interface CreateWpErrorEnvelopeInput {
    readonly code: string;
    readonly problem: string;
    readonly cause: string;
    readonly fix: string;
    readonly docsUrl: string;
    readonly evidence: unknown;
    readonly redact?: readonly string[];
}
export interface WpErrorInit {
    readonly code: `WP_${string}`;
    readonly problem: string;
    readonly cause?: string;
    readonly fix?: string;
    readonly docsPath?: string;
    readonly evidence?: readonly string[] | string;
}
export interface WpErrorJson {
    readonly ok: false;
    readonly code: `WP_${string}`;
    readonly problem: string;
    readonly cause?: string;
    readonly fix?: string;
    readonly docsUrl?: string;
    readonly evidence?: readonly string[];
}
export declare function isWpErrorCode(value: string): boolean;
export declare function validateWpErrorDocsUrl(value: string): string;
export declare function createWpErrorEnvelope(input: CreateWpErrorEnvelopeInput): WpErrorEnvelope;
export declare class WpError extends Error {
    readonly code: `WP_${string}`;
    readonly causeText?: string;
    readonly fix?: string;
    readonly docsPath?: string;
    readonly evidence?: readonly string[];
    constructor(input: WpErrorInit);
}
export declare function createWpError(input: WpErrorInit): WpError;
export declare function toWpErrorJson(error: WpError): WpErrorJson;
export declare function formatWpError(error: WpError): string;
export declare function ensureWpError(error: unknown, fallback: Omit<WpErrorInit, 'problem'> & {
    readonly problem?: string;
}): WpError;
//# sourceMappingURL=wp-error.d.ts.map