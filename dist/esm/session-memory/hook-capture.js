const DEFAULT_MAX_CONTENT_BYTES = 8 * 1024;
const SUMMARY_MAX_BYTES = 160;
function normalizedByteCap(maxContentBytes) {
    if (maxContentBytes === undefined)
        return DEFAULT_MAX_CONTENT_BYTES;
    if (!Number.isFinite(maxContentBytes))
        return DEFAULT_MAX_CONTENT_BYTES;
    return Math.max(0, Math.floor(maxContentBytes));
}
function capUtf8Bytes(value, maxBytes) {
    if (Buffer.byteLength(value, "utf8") <= maxBytes)
        return { value, truncated: false };
    let bytes = 0;
    let capped = "";
    for (const char of value) {
        const charBytes = Buffer.byteLength(char, "utf8");
        if (bytes + charBytes > maxBytes)
            break;
        capped += char;
        bytes += charBytes;
    }
    return { value: capped, truncated: true };
}
function collapseWhitespace(value) {
    return value.trim().replace(/\s+/gu, " ");
}
function summarize(eventType, content) {
    const collapsed = collapseWhitespace(content);
    const prefix = eventType === "decision" ? "Decision: " : eventType === "constraint" ? "Constraint: " : "";
    return capUtf8Bytes(`${prefix}${collapsed}`, SUMMARY_MAX_BYTES).value;
}
export function buildContinuityEvent(input) {
    const maxBytes = normalizedByteCap(input.maxContentBytes);
    const cappedContent = capUtf8Bytes(input.content, maxBytes);
    const metadata = cappedContent.truncated || input.metadata !== undefined
        ? { ...input.metadata, ...(cappedContent.truncated ? { truncated: true } : {}) }
        : undefined;
    return {
        eventType: input.eventType,
        toolName: input.toolName ?? "unknown",
        content: cappedContent.value,
        summary: input.summary
            ? capUtf8Bytes(collapseWhitespace(input.summary), SUMMARY_MAX_BYTES).value
            : summarize(input.eventType, cappedContent.value),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(metadata === undefined ? {} : { metadata }),
    };
}
function parsePromptAnnotations(prompt) {
    const annotations = [];
    for (const line of prompt.split(/(?:\\n|\r?\n)/u)) {
        const match = /^\s*(?:[-*]\s*)?(Decision|Constraint)s?\s*:\s*(.+?)\s*$/iu.exec(line);
        if (!match)
            continue;
        const label = match[1]?.toLowerCase();
        const content = match[2];
        if (!content)
            continue;
        annotations.push({
            eventType: label === "decision" ? "decision" : "constraint",
            content,
        });
    }
    return annotations;
}
export function buildPromptContinuityEvents(input) {
    const prompt = input.prompt.trim();
    if (!prompt)
        return [];
    const events = [
        buildContinuityEvent({
            eventType: "user_prompt",
            toolName: "UserPromptSubmit",
            content: prompt,
            priority: 50,
            metadata: { source: "prompt" },
            maxContentBytes: input.maxContentBytes,
        }),
    ];
    for (const annotation of parsePromptAnnotations(prompt)) {
        events.push(buildContinuityEvent({
            eventType: annotation.eventType,
            toolName: "UserPromptSubmit",
            content: annotation.content,
            priority: annotation.eventType === "decision" ? 90 : 85,
            metadata: { source: "prompt" },
            maxContentBytes: input.maxContentBytes,
        }));
    }
    return events;
}
//# sourceMappingURL=hook-capture.js.map