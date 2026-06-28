/**
 * Detect if content is JSON
 */
function isJSON(content) {
    const trimmed = content.trim();
    if (!trimmed)
        return false;
    // Must start with { or [
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return false;
    }
    // Try to parse as JSON
    try {
        JSON.parse(trimmed);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Detect if content is TypeScript
 */
function isTypeScript(content) {
    const tsPatterns = [
        /\binterface\s+\w+/,
        /\btype\s+\w+\s*=/,
        /:\s*(string|number|boolean|any|unknown|never)\b/,
        /<\w+>/,
        /\bas\s+\w+/,
        /\bnamespace\s+\w+/,
        /\benum\s+\w+/,
    ];
    return tsPatterns.some((pattern) => pattern.test(content));
}
/**
 * Detect if content is JavaScript
 */
function isJavaScript(content) {
    const jsPatterns = [
        /\b(const|let|var)\s+\w+\s*=/,
        /\bfunction\s+\w+/,
        /\bclass\s+\w+/,
        /=>\s*{/,
        /\bimport\s+.*\bfrom\b/,
        /\bexport\s+(default|const|function|class)/,
        /\brequire\(['"].*['"]\)/,
    ];
    return jsPatterns.some((pattern) => pattern.test(content));
}
/**
 * Detect if content is Shell script
 */
function isShell(content) {
    const shellPatterns = [
        /^#!/,
        /^\$\s+/m,
        /\b(npm|pnpm|yarn|git|cd|ls|mkdir|rm|cp|mv)\s+/,
        /\|\s*\w+/,
        /&&|\|\|/,
        /\bexport\s+\w+=/,
    ];
    return shellPatterns.some((pattern) => pattern.test(content));
}
/**
 * Count YAML-like lines in content
 */
function countYamlLines(lines) {
    let count = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        if (/^\w+:\s*.+/.test(trimmed))
            count++;
        if (/^-\s+\w+/.test(trimmed))
            count++;
    }
    return count;
}
/**
 * Detect if content is YAML
 */
function isYAML(content) {
    const lines = content.split("\n");
    const yamlLikeLines = countYamlLines(lines);
    const nonEmptyLines = lines.filter((l) => l.trim()).length;
    return nonEmptyLines > 0 && yamlLikeLines / nonEmptyLines > 0.5;
}
/**
 * Detect if content is SQL
 */
function isSQL(content) {
    const sqlPatterns = [
        /\bSELECT\s+.*\bFROM\b/i,
        /\bINSERT\s+INTO\b/i,
        /\bUPDATE\s+.*\bSET\b/i,
        /\bDELETE\s+FROM\b/i,
        /\bCREATE\s+(TABLE|INDEX|VIEW)\b/i,
        /\bALTER\s+TABLE\b/i,
        /\bDROP\s+(TABLE|INDEX)\b/i,
    ];
    return sqlPatterns.some((pattern) => pattern.test(content));
}
/**
 * Extract language hint from context text
 */
function extractLanguageFromContext(text) {
    const lowerText = text.toLowerCase();
    // Check for language mentions in headings or text
    const languageHints = {
        typescript: ["typescript", ".ts", ".tsx"],
        javascript: ["javascript", "", ".jsx"],
        json: ["json", ".json"],
        bash: ["bash", "shell", "sh", "terminal", "command"],
        yaml: ["yaml", ".yaml", ".yml"],
        sql: ["sql", "query", "database"],
        python: ["python", ".py"],
        go: ["go", "golang", ".go"],
        rust: ["rust", ".rs"],
    };
    for (const [lang, hints] of Object.entries(languageHints)) {
        if (hints.some((hint) => lowerText.includes(hint))) {
            return lang;
        }
    }
    return null;
}
/** Content-based language detectors in priority order */
const CONTENT_DETECTORS = [
    { detect: isJSON, language: "json", confidence: 0.95, reason: "Valid JSON syntax" },
    { detect: isSQL, language: "sql", confidence: 0.9, reason: "SQL keywords detected" },
    {
        detect: isTypeScript,
        language: "typescript",
        confidence: 0.85,
        reason: "TypeScript syntax detected",
    },
    {
        detect: isShell,
        language: "bash",
        confidence: 0.85,
        reason: "Shell command patterns detected",
    },
    { detect: isYAML, language: "yaml", confidence: 0.8, reason: "YAML structure detected" },
    {
        detect: isJavaScript,
        language: "javascript",
        confidence: 0.75,
        reason: "JavaScript syntax detected",
    },
];
/**
 * Try content-based language detection
 */
function tryContentBasedInference(content) {
    for (const { detect, language, confidence, reason } of CONTENT_DETECTORS) {
        if (detect(content)) {
            return { language, confidence, reason };
        }
    }
    return null;
}
/**
 * Try context-based language detection
 */
function tryContextBasedInference(context) {
    if (!context.precedingText)
        return null;
    const contextLang = extractLanguageFromContext(context.precedingText);
    if (contextLang) {
        return {
            language: contextLang,
            confidence: 0.6,
            reason: `Language mentioned in context: "${context.precedingText.slice(0, 50)}..."`,
        };
    }
    return null;
}
/**
 * Infer the programming language of a code block
 */
export function inferCodeLanguage(codeContent, context = {}) {
    const trimmed = codeContent.trim();
    if (!trimmed) {
        return { language: "text", confidence: 1.0, reason: "Empty code block" };
    }
    const contentInference = tryContentBasedInference(trimmed);
    if (contentInference)
        return contentInference;
    const contextInference = tryContextBasedInference(context);
    if (contextInference)
        return contextInference;
    return {
        language: "text",
        confidence: 0.3,
        reason: "Could not determine language from content or context",
    };
}
/**
 * Handle the start of a code block
 */
function handleCodeBlockStart(line, lineIndex, state, result) {
    const language = line.trim().slice(3).trim();
    if (!language) {
        state.codeBlockStart = lineIndex;
        state.inCodeBlock = true;
    }
    else {
        state.precedingText = "";
    }
    result.push(line);
}
/**
 * Handle the end of a code block and apply language inference
 */
function handleCodeBlockEnd(line, state, result, filePath, minConfidence) {
    const codeLines = result.slice(state.codeBlockStart + 1);
    const codeContent = codeLines.join("\n");
    const inference = inferCodeLanguage(codeContent, {
        precedingText: state.precedingText,
        filePath,
        line: state.codeBlockStart + 1,
    });
    let changeCount = 0;
    if (inference.confidence >= minConfidence) {
        result[state.codeBlockStart] = `\`\`\`${inference.language}`;
        changeCount = 1;
    }
    result.push(line);
    state.inCodeBlock = false;
    state.precedingText = "";
    return changeCount;
}
/**
 * Update preceding text context for language inference
 */
function updatePrecedingText(state, line) {
    if (!state.inCodeBlock && line.trim()) {
        state.precedingText += `${line}\n`;
        if (state.precedingText.length > 500) {
            state.precedingText = state.precedingText.slice(-500);
        }
    }
}
/**
 * Process a single line during code block language fixing
 */
function processCodeBlockLine(line, lineIndex, state, result, filePath, minConfidence) {
    if (line.trim().startsWith("```")) {
        if (!state.inCodeBlock) {
            handleCodeBlockStart(line, lineIndex, state, result);
            return 0;
        }
        return handleCodeBlockEnd(line, state, result, filePath, minConfidence);
    }
    result.push(line);
    updatePrecedingText(state, line);
    return 0;
}
/**
 * Find and fix code blocks without language specifiers in markdown content
 */
export function fixCodeBlockLanguages(content, filePath, minConfidence = 0.7) {
    const lines = content.split("\n");
    const result = [];
    let changes = 0;
    const state = { inCodeBlock: false, codeBlockStart: -1, precedingText: "" };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined)
            continue;
        changes += processCodeBlockLine(line, i, state, result, filePath, minConfidence);
    }
    return { fixed: result.join("\n"), changes };
}
//# sourceMappingURL=code-language.js.map