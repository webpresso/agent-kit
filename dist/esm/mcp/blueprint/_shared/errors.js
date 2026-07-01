import { bytes } from "#mcp/blueprint/_shared/payload";
export function jsonContent(payload, isError = false) {
    return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError,
    };
}
export function parseStructuredJson(result) {
    if (result.structuredContent && typeof result.structuredContent === "object") {
        return result.structuredContent;
    }
    const text = result.content.find((item) => item.type === "text");
    if (!text || typeof text.text !== "string")
        return {};
    try {
        return JSON.parse(text.text);
    }
    catch {
        return {};
    }
}
export function err(summary, error) {
    return jsonContent({ summary, failures: [error], bytes: 0, tokensSaved: 0 }, true);
}
export function finishPayload(payload) {
    payload["bytes"] = bytes(JSON.stringify(payload));
    return jsonContent(payload);
}
//# sourceMappingURL=errors.js.map