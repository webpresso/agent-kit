import { getErrorMessage } from "#format/errors.js";
import { isValidRelativePath } from "./shared/validate-path.js";
async function getSemanticContext(semanticContext, ragRetriever, path) {
    if (!semanticContext || !ragRetriever) {
        return "";
    }
    try {
        const ctx = await ragRetriever.retrieve(path, { topK: 3 });
        if (!ctx.chunks.length) {
            return "";
        }
        const formatted = ctx.chunks
            .map((r) => {
            const meta = r.chunk.metadata;
            const filepath = meta?.filepath ?? "unknown";
            const start = meta?.startLine;
            const end = meta?.endLine;
            const loc = start && end ? `${filepath}:${start}-${end}` : filepath;
            const snippet = (r.chunk.content || "").split("\n").slice(0, 5).join("\n");
            return `${loc}\n${snippet}`;
        })
            .join("\n\n");
        return `\n\nSemantic context:\n${formatted}`;
    }
    catch (error) {
        console.warn("read_file semantic context failed", error);
        return "";
    }
}
function handleReadFileError(error, path) {
    const message = getErrorMessage(error);
    if (message.includes("ENOENT")) {
        return {
            success: false,
            output: `File not found: ${path}`,
            error: `File "${path}" does not exist`,
        };
    }
    return {
        success: false,
        output: `Failed to read file: ${message}`,
        error: message,
    };
}
export const readFileTool = {
    name: "read_file",
    description: "Read the contents of a file at the specified path. Returns the file content as text. Use this to understand existing code before making changes.",
    inputSchema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: 'The relative path to the file to read (e.g., "src/index.ts")',
            },
            startLine: {
                type: "number",
                description: "Optional starting line number (1-indexed). If omitted, reads from the beginning.",
            },
            endLine: {
                type: "number",
                description: "Optional ending line number (1-indexed, inclusive). If omitted, reads to the end.",
            },
            semanticContext: {
                type: "boolean",
                description: "If true and ragRetriever is available, returns top semantic matches for this file path.",
            },
        },
        required: ["path"],
    },
    async execute(input, context) {
        const path = input.path;
        const startLine = input.startLine;
        const endLine = input.endLine;
        const semanticContext = input.semanticContext ?? false;
        if (!isValidRelativePath(path)) {
            return {
                success: false,
                output: "Invalid path: path traversal not allowed",
                error: 'Path must be relative and cannot contain ".."',
            };
        }
        if (!context.storage) {
            return {
                success: false,
                output: "Storage adapter not configured",
                error: "No storage adapter provided in context",
            };
        }
        try {
            const content = await context.storage.readFile(path, { startLine, endLine });
            const lines = content.split("\n");
            const startIdx = startLine ?? 1;
            const numberedContent = lines
                .map((line, i) => `${String(startIdx + i).padStart(4, " ")}│ ${line}`)
                .join("\n");
            const semanticSection = await getSemanticContext(semanticContext, context.ragRetriever, path);
            return {
                success: true,
                output: numberedContent + semanticSection,
                data: { path, lineCount: lines.length, startLine: startIdx },
            };
        }
        catch (error) {
            return handleReadFileError(error, path);
        }
    },
};
//# sourceMappingURL=read-file.js.map