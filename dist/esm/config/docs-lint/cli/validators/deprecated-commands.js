/**
 * Deprecated command patterns to detect in bash code blocks.
 *
 * Enforces the "just-first" philosophy: all quality commands must use
 * flag-based syntax (--file / --package) rather than positional arguments
 * or direct tool invocations.
 */
const DEPRECATED_PATTERNS = [
    // just lint-file <path> → just lint --file <path>
    {
        pattern: /\bjust\s+lint-file\b/,
        message: 'Deprecated: just lint-file — use flag-based syntax instead',
        replacement: 'just lint --file <path> (or --package <name>)',
    },
    // just test file <path> → just test --file <path>
    {
        pattern: /\bjust\s+test\s+file\b/,
        message: 'Deprecated: just test file — use flag-based syntax instead',
        replacement: 'just test --file <path> (or --package <name>)',
    },
    // just typecheck <positional> (without --file or --package flag)
    // Catches: `just typecheck cli2` but NOT `just typecheck --package cli2`
    {
        pattern: /\bjust\s+typecheck\s+(?!--)[a-zA-Z0-9_/-]/,
        message: 'Deprecated: just typecheck with positional argument — use flag-based syntax instead',
        replacement: 'just typecheck --package <name> (or --file <path>)',
    },
    // just lint <positional> (without --file or --package flag)
    // Catches: `just lint cli2` but NOT `just lint --file src/`
    {
        pattern: /\bjust\s+lint\s+(?!--)[a-zA-Z0-9_/-]/,
        message: 'Deprecated: just lint with positional argument — use flag-based syntax instead',
        replacement: 'just lint --package <name> (or --file <path>)',
    },
    // just test <positional> (without --file or --package flag)
    // Catches: `just test cli2` but NOT `just test --package cli2`
    {
        pattern: /\bjust\s+test\s+(?!--)[a-zA-Z0-9_/-]/,
        message: 'Deprecated: just test with positional argument — use flag-based syntax instead',
        replacement: 'just test --package <name> (or --file <path>)',
    },
    // pnpm vitest (direct invocation)
    {
        pattern: /\bpnpm\s+vitest\b/,
        message: 'Deprecated: pnpm vitest — use just instead',
        replacement: 'just test --file <path> (or --package <name>)',
    },
];
/**
 * Extract bash code blocks from markdown content (reuses same logic as command-safety).
 * Returns blocks with their content and starting line number.
 */
function extractBashBlocks(content) {
    const BASH_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', '']);
    const blocks = [];
    const lines = content.split('\n');
    let inBlock = false;
    let isBash = false;
    let blockStart = 0;
    const blockContent = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined)
            continue;
        if (line.startsWith('```')) {
            if (!inBlock) {
                const lang = line.slice(3).trim().toLowerCase();
                inBlock = true;
                isBash = BASH_LANGUAGES.has(lang);
                blockStart = i + 1;
                blockContent.length = 0;
            }
            else {
                if (isBash && blockContent.length > 0) {
                    blocks.push({ code: blockContent.join('\n'), line: blockStart + 1 });
                }
                inBlock = false;
                isBash = false;
            }
        }
        else if (inBlock) {
            blockContent.push(line);
        }
    }
    return blocks;
}
/**
 * Validate that bash code blocks don't use deprecated command syntax.
 *
 * Enforces the "just-first" philosophy by catching positional argument usage
 * and direct tool invocations that should use flag-based just recipes instead.
 */
export function validateDeprecatedCommands(filePath, content) {
    const errors = [];
    const bashBlocks = extractBashBlocks(content);
    for (const block of bashBlocks) {
        for (const { pattern, message, replacement } of DEPRECATED_PATTERNS) {
            if (pattern.test(block.code)) {
                errors.push({
                    file: filePath,
                    line: block.line,
                    severity: 'warning',
                    source: 'structure',
                    message: `${message}. Use: ${replacement}`,
                    ruleId: 'deprecated-commands',
                });
            }
        }
    }
    return errors;
}
//# sourceMappingURL=deprecated-commands.js.map