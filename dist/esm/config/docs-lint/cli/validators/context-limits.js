/**
 * Context file size limits based on best practices.
 *
 * Research sources:
 * - HumanLayer: <60 lines ideal, <300 max for CLAUDE.md
 * - Anthropic: Keep concise, ~150-200 instruction limit (Claude uses ~50)
 * - Token budget: 200k total, ~20k baseline, 180k available
 *
 * @see https://www.humanlayer.dev/blog/writing-a-good-claude-md
 * @see https://www.anthropic.com/engineering/claude-code-best-practices
 */
export const CONTEXT_FILE_LIMITS = {
    // Root CLAUDE.md - should be minimal, reference other files
    "CLAUDE.md": {
        maxLines: 60,
        warnLines: 30,
        maxTokens: 2000,
        warnTokens: 1000,
        description: "Root context file (keep minimal, use @references)",
    },
    // agent-guide.md - main instructions file (formerly AGENTS.md)
    // Increased from 300 to 500: original limit was arbitrary, token count matters more
    // Current agent-guide.md uses ~3k tokens (well under 10k limit)
    "agent-guide.md": {
        maxLines: 500,
        warnLines: 400,
        maxTokens: 10000,
        warnTokens: 7000,
        description: "Agent instructions (consider modular extraction if large)",
    },
    // Skill files - focused, single-purpose
    "SKILL.md": {
        maxLines: 150,
        warnLines: 100,
        maxTokens: 5000,
        warnTokens: 3000,
        description: "Skill definition (keep focused on single capability)",
    },
    // Agent definitions
    "agent.md": {
        maxLines: 100,
        warnLines: 60,
        maxTokens: 3000,
        warnTokens: 2000,
        description: "Agent definition (subagent instructions)",
    },
    // Standard command files
    "command.md": {
        maxLines: 200,
        warnLines: 120,
        maxTokens: 6000,
        warnTokens: 4000,
        description: "Command definition (slash command)",
    },
    // Audit commands - comprehensive checklists with examples need more space
    // These are only loaded when invoked, not at session start
    "audit-command.md": {
        maxLines: 900,
        warnLines: 700,
        maxTokens: 30000,
        warnTokens: 25000,
        description: "Audit command (comprehensive checklist)",
    },
    // Complex operational commands (parallel-execute, create-package, debug-ci-failure)
    "operational-command.md": {
        maxLines: 650,
        warnLines: 500,
        maxTokens: 20000,
        warnTokens: 15000,
        description: "Operational command (complex workflow)",
    },
};
/**
 * Pattern-based limits for files matching globs.
 */
export const CONTEXT_FILE_PATTERNS = [
    {
        pattern: /^\.claude\/skills\/.*\/SKILL\.md$/,
        limits: CONTEXT_FILE_LIMITS["SKILL.md"],
    },
    {
        pattern: /^\.claude\/agents\/.*\.md$/,
        limits: CONTEXT_FILE_LIMITS["agent.md"],
    },
    // Audit commands - comprehensive checklists need more space
    {
        pattern: /^\.claude\/commands\/audit-.*\.md$/,
        limits: CONTEXT_FILE_LIMITS["audit-command.md"],
    },
    // Complex operational commands
    {
        pattern: /^\.claude\/commands\/(parallel-execute|create-package|debug-ci-failure|upgrade-dependency|migrate-plan|fix-all-qa)\.md$/,
        limits: CONTEXT_FILE_LIMITS["operational-command.md"],
    },
    // Standard commands (must come last as catch-all)
    {
        pattern: /^\.claude\/commands\/.*\.md$/,
        limits: CONTEXT_FILE_LIMITS["command.md"],
    },
];
/**
 * Estimate token count from content.
 * Uses rough approximation of 1 token ≈ 4 characters.
 * This is conservative - actual tokenization varies by content.
 */
export function estimateTokens(content) {
    return Math.ceil(content.length / 4);
}
/**
 * Count lines in content.
 */
export function countLines(content) {
    return content.split("\n").length;
}
/**
 * Get limits for a file path.
 * Returns undefined if file is not a context file.
 */
export function getLimitsForFile(filePath) {
    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, "/");
    // Check exact filename matches first
    const filename = normalizedPath.split("/").pop() || "";
    if (CONTEXT_FILE_LIMITS[filename]) {
        return CONTEXT_FILE_LIMITS[filename];
    }
    // Check pattern matches
    for (const { pattern, limits } of CONTEXT_FILE_PATTERNS) {
        if (pattern.test(normalizedPath)) {
            return limits;
        }
    }
    return undefined;
}
/**
 * Validate context file size limits.
 * Returns empty array if file is not a context file.
 */
export function validateContextLimits(filePath, content) {
    const limits = getLimitsForFile(filePath);
    if (!limits) {
        return [];
    }
    const errors = [];
    const lines = countLines(content);
    const tokens = estimateTokens(content);
    // Line count validation
    if (lines > limits.maxLines) {
        errors.push({
            file: filePath,
            severity: "error",
            source: "context-limits",
            message: `Context file exceeds ${limits.maxLines} line limit (${lines} lines). ${limits.description}`,
            ruleId: "context-max-lines",
        });
    }
    else if (lines > limits.warnLines) {
        errors.push({
            file: filePath,
            severity: "warning",
            source: "context-limits",
            message: `Context file approaching limit: ${lines}/${limits.maxLines} lines. ${limits.description}`,
            ruleId: "context-warn-lines",
        });
    }
    // Token count validation
    if (limits.maxTokens && tokens > limits.maxTokens) {
        errors.push({
            file: filePath,
            severity: "error",
            source: "context-limits",
            message: `Context file exceeds ~${limits.maxTokens} token limit (~${tokens} tokens). Consider splitting into modular files.`,
            ruleId: "context-max-tokens",
        });
    }
    else if (limits.warnTokens && tokens > limits.warnTokens) {
        errors.push({
            file: filePath,
            severity: "warning",
            source: "context-limits",
            message: `Context file approaching token limit: ~${tokens}/${limits.maxTokens} tokens.`,
            ruleId: "context-warn-tokens",
        });
    }
    return errors;
}
/**
 * Generate a summary of context file usage.
 * Useful for understanding total context budget consumption.
 */
export function summarizeContextUsage(files) {
    const summary = {
        totalLines: 0,
        totalTokens: 0,
        files: [],
    };
    for (const file of files) {
        const lines = countLines(file.content);
        const tokens = estimateTokens(file.content);
        const limits = getLimitsForFile(file.path);
        summary.totalLines += lines;
        summary.totalTokens += tokens;
        summary.files.push({
            path: file.path,
            lines,
            tokens,
            limits,
        });
    }
    return summary;
}
//# sourceMappingURL=context-limits.js.map