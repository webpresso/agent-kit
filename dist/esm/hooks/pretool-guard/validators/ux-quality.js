import { getContent, getFilePath } from "#hooks/shared/types";
const VALIDATOR_NAME = "ux-quality";
const ALERT_PATTERN = /\b(?:window\.)?alert\s*\(/g;
const CATCH_CONSOLE_ERROR_ONLY_PATTERN = /catch\s*(?:\([^)]*\))?\s*\{\s*console\.error\s*\([\s\S]*?\)\s*;?\s*\}/g;
const USE_QUERY_DESTRUCTURE_PATTERN = /const\s*\{([^}]*)\}\s*=\s*useQuery\s*\(/g;
const USE_QUERY_ASSIGNMENT_PATTERN = /(?:const|let|var)\s+\w+\s*=\s*useQuery\s*\(/g;
function getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
}
function collectAlertViolations(content) {
    const violations = [];
    for (const match of content.matchAll(ALERT_PATTERN)) {
        const text = match[0] === "window.alert(" ? "window.alert()" : "alert()";
        violations.push({
            line: getLineNumber(content, match.index ?? 0),
            message: `Avoid ${text}; use non-blocking UI feedback instead.`,
        });
    }
    return violations;
}
function collectCatchViolations(content) {
    const violations = [];
    for (const match of content.matchAll(CATCH_CONSOLE_ERROR_ONLY_PATTERN)) {
        violations.push({
            line: getLineNumber(content, match.index ?? 0),
            message: "catch block only logs with console.error; add user-facing handling and recovery.",
        });
    }
    return violations;
}
function buildMissingFieldsMessage(hasIsPending, hasIsError) {
    const missing = [hasIsPending ? null : "isPending", hasIsError ? null : "isError"]
        .filter((name) => Boolean(name))
        .join(" and ");
    return `useQuery destructuring must include ${missing}.`;
}
function collectUseQueryViolations(content) {
    const violations = [];
    for (const match of content.matchAll(USE_QUERY_DESTRUCTURE_PATTERN)) {
        const fields = match[1] || "";
        const hasIsPending = /\bisPending\b/.test(fields);
        const hasIsError = /\bisError\b/.test(fields);
        if (!hasIsPending || !hasIsError) {
            violations.push({
                line: getLineNumber(content, match.index ?? 0),
                message: buildMissingFieldsMessage(hasIsPending, hasIsError),
            });
        }
    }
    for (const match of content.matchAll(USE_QUERY_ASSIGNMENT_PATTERN)) {
        violations.push({
            line: getLineNumber(content, match.index ?? 0),
            message: "useQuery result must handle isPending and isError states.",
        });
    }
    return violations;
}
export function validateUxQuality(input) {
    const filePath = getFilePath(input);
    const content = getContent(input);
    if (!filePath || !content)
        return { validator: VALIDATOR_NAME, passed: true };
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath))
        return { validator: VALIDATOR_NAME, passed: true };
    const violations = [
        ...collectAlertViolations(content),
        ...collectCatchViolations(content),
        ...collectUseQueryViolations(content),
    ];
    if (!violations.length)
        return { validator: VALIDATOR_NAME, passed: true };
    const preview = violations.slice(0, 4).map((v) => `  Line ${v.line}: ${v.message}`);
    const overflow = violations.length > 4 ? `\n  ...and ${violations.length - 4} more` : "";
    return {
        validator: VALIDATOR_NAME,
        passed: false,
        message: `UX anti-patterns detected:\n${preview.join("\n")}${overflow}`,
    };
}
//# sourceMappingURL=ux-quality.js.map