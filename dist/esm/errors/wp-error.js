import { redactText } from '#mcp/tools/_shared/redact.js';
const DOCS_URL_PATTERN = /^docs\/errors\/[a-z0-9-]+\.md(?:#[a-z0-9_-]+)?$/u;
const WP_ERROR_CODE_PATTERN = /^WP_[A-Z0-9_]+$/u;
export function isWpErrorCode(value) {
    return WP_ERROR_CODE_PATTERN.test(value);
}
export function validateWpErrorDocsUrl(value) {
    if (!DOCS_URL_PATTERN.test(value)) {
        throw new Error('docsUrl must point to docs/errors/*.md with an optional anchor.');
    }
    return value;
}
function redactStringValue(value, explicitSecrets) {
    let next = redactText(value) ?? value;
    let redacted = next !== value;
    for (const secret of [...explicitSecrets].sort((left, right) => right.length - left.length)) {
        if (!secret)
            continue;
        if (next.includes(secret)) {
            next = next.split(secret).join('[REDACTED]');
            redacted = true;
        }
    }
    return { value: next, redacted };
}
function redactUnknownEvidence(value, explicitSecrets) {
    if (typeof value === 'string') {
        return redactStringValue(value, explicitSecrets);
    }
    if (Array.isArray(value)) {
        let redacted = false;
        const items = value.map((entry) => {
            const next = redactUnknownEvidence(entry, explicitSecrets);
            redacted ||= next.redacted;
            return next.value;
        });
        return { value: items, redacted };
    }
    if (!value || typeof value !== 'object') {
        return { value, redacted: false };
    }
    let redacted = false;
    const entries = Object.entries(value).map(([key, entry]) => {
        const next = redactUnknownEvidence(entry, explicitSecrets);
        redacted ||= next.redacted;
        return [key, next.value];
    });
    return { value: Object.fromEntries(entries), redacted };
}
export function createWpErrorEnvelope(input) {
    if (!isWpErrorCode(input.code)) {
        throw new Error(`Invalid WP error code: ${input.code}`);
    }
    const docsUrl = validateWpErrorDocsUrl(input.docsUrl);
    const { value, redacted } = redactUnknownEvidence(input.evidence, input.redact ?? []);
    return {
        code: input.code,
        problem: input.problem,
        cause: input.cause,
        fix: input.fix,
        docsUrl,
        evidence: value,
        redacted,
    };
}
function normalizeEvidence(evidence) {
    return typeof evidence === 'string' ? [evidence] : [...(evidence ?? [])];
}
function redactEvidenceText(value, secrets = []) {
    return redactStringValue(value, secrets).value;
}
export class WpError extends Error {
    code;
    causeText;
    fix;
    docsPath;
    evidence;
    constructor(input) {
        super(input.problem);
        this.name = 'WpError';
        this.code = input.code;
        const rawEvidence = normalizeEvidence(input.evidence);
        this.causeText = input.cause ? redactEvidenceText(input.cause, rawEvidence) : undefined;
        this.fix = input.fix;
        this.docsPath = input.docsPath;
        this.evidence = rawEvidence.map((value) => redactEvidenceText(value, rawEvidence));
    }
}
export function createWpError(input) {
    return new WpError(input);
}
export function toWpErrorJson(error) {
    return {
        ok: false,
        code: error.code,
        problem: error.message,
        ...(error.causeText ? { cause: redactEvidenceText(error.causeText) } : {}),
        ...(error.fix ? { fix: error.fix } : {}),
        ...(error.docsPath ? { docsUrl: error.docsPath } : {}),
        ...(error.evidence && error.evidence.length > 0 ? { evidence: error.evidence } : {}),
    };
}
export function formatWpError(error) {
    return [
        `${error.code}: ${error.message}`,
        error.causeText ? `cause: ${redactEvidenceText(error.causeText)}` : '',
        error.fix ? `fix: ${error.fix}` : '',
        error.docsPath ? `docs: ${error.docsPath}` : '',
        error.evidence && error.evidence.length > 0 ? `evidence: ${error.evidence.join(' | ')}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}
export function ensureWpError(error, fallback) {
    if (error instanceof WpError)
        return error;
    if (error instanceof Error) {
        return createWpError({
            ...fallback,
            problem: fallback.problem ?? error.message,
            cause: error.message,
        });
    }
    return createWpError({
        ...fallback,
        problem: fallback.problem ?? String(error),
        cause: String(error),
    });
}
//# sourceMappingURL=wp-error.js.map