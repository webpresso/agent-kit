import { getErrorMessage } from '@webpresso/utils/errors';
import { isValidRelativePath } from './shared/validate-path.js';
async function performSemanticSearch(pattern, maxResults, context) {
    if (!context.ragRetriever) {
        return {
            success: false,
            output: 'Semantic search unavailable: ragRetriever not configured',
            error: 'ragRetriever missing in context',
        };
    }
    try {
        const results = await context.ragRetriever.retrieve(pattern, { topK: maxResults });
        if (!results.chunks.length) {
            return {
                success: true,
                output: `No semantic matches found for query: ${pattern}`,
                data: { pattern, matches: [], count: 0, semantic: true },
            };
        }
        const formatted = results.chunks
            .map((r) => {
            const meta = r.chunk.metadata;
            const filepath = meta?.filepath ?? 'unknown';
            const startLine = meta?.startLine;
            const endLine = meta?.endLine;
            const location = startLine && endLine ? `${filepath}:${startLine}-${endLine}` : filepath;
            const snippet = (r.chunk.content || '').split('\n').slice(0, 6).join('\n');
            return `${location}\n${snippet}\n(score: ${r.score.toFixed(2)})`;
        })
            .join('\n\n');
        return {
            success: true,
            output: formatted,
            data: {
                pattern,
                matches: results.chunks,
                count: results.chunks.length,
                semantic: true,
            },
        };
    }
    catch (error) {
        const message = getErrorMessage(error);
        return {
            success: false,
            output: `Semantic search failed: ${message}`,
            error: message,
        };
    }
}
async function performRegexSearch(pattern, path, filePattern, caseSensitive, maxResults, context) {
    if (!context.storage) {
        return {
            success: false,
            output: 'Storage adapter not configured',
            error: 'No storage adapter provided in context',
        };
    }
    try {
        const normalizedPath = path === '.' ? '' : path;
        const matches = await context.storage.searchFiles(pattern, {
            path: normalizedPath,
            filePattern,
            caseSensitive,
            maxResults,
        });
        if (!matches.length) {
            return {
                success: true,
                output: `No matches found for pattern: ${pattern}`,
                data: { pattern, matches: [], count: 0 },
            };
        }
        const formatted = matches
            .map((m) => {
            const highlighted = highlightMatch(m.content, m.matchStart, m.matchEnd);
            return `${m.path}:${m.line}: ${highlighted}`;
        })
            .join('\n');
        const truncated = matches.length >= maxResults ? `\n\n(Showing first ${maxResults} results)` : '';
        return {
            success: true,
            output: formatted + truncated,
            data: { pattern, matches, count: matches.length, truncated: matches.length >= maxResults },
        };
    }
    catch (error) {
        const message = getErrorMessage(error);
        return {
            success: false,
            output: `Failed to search files: ${message}`,
            error: message,
        };
    }
}
function highlightMatch(content, start, end) {
    const before = content.slice(0, start);
    const match = content.slice(start, end);
    const after = content.slice(end);
    return `${before}**${match}**${after}`;
}
export const searchFilesTool = {
    name: 'search_files',
    description: 'Search for a pattern in files. Returns matching lines with file paths and line numbers. Use this to find specific code, function definitions, or usages.',
    inputSchema: {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'The search pattern (supports regex). Examples: "function handleSubmit", "import.*from", "TODO:"',
            },
            path: {
                type: 'string',
                description: 'The relative path to search in (e.g., "src" to search only in src/). Use "" or "." for entire project.',
            },
            filePattern: {
                type: 'string',
                description: 'Optional glob pattern to filter files to search (e.g., "*.ts", "*.tsx", "**/*.test.ts")',
            },
            semantic: {
                type: 'boolean',
                description: 'Use semantic search (RAG) instead of regex. Requires ragRetriever in context. Defaults to false.',
            },
            caseSensitive: {
                type: 'boolean',
                description: 'If true, search is case-sensitive. Defaults to false.',
            },
            maxResults: {
                type: 'number',
                description: 'Maximum number of results to return. Defaults to 50.',
            },
        },
        required: ['pattern'],
    },
    execute(input, context) {
        const pattern = input.pattern;
        const path = input.path || '.';
        const filePattern = input.filePattern;
        const semantic = input.semantic ?? false;
        const caseSensitive = input.caseSensitive ?? false;
        const maxResults = input.maxResults ?? 50;
        if (!isValidRelativePath(path)) {
            return Promise.resolve({
                success: false,
                output: 'Invalid path: path traversal not allowed',
                error: 'Path must be relative and cannot contain ".."',
            });
        }
        if (semantic) {
            return performSemanticSearch(pattern, maxResults, context);
        }
        try {
            const regex = new RegExp(pattern, caseSensitive ? '' : 'i');
            void regex;
        }
        catch {
            return Promise.resolve({
                success: false,
                output: `Invalid regex pattern: ${pattern}`,
                error: 'The search pattern is not a valid regular expression',
            });
        }
        return performRegexSearch(pattern, path, filePattern, caseSensitive, maxResults, context);
    },
};
//# sourceMappingURL=search-files.js.map