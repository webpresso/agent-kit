import type { ValidationError } from "#config/docs-lint/index";

/**
 * Dangerous command patterns to detect in bash code blocks
 * Inspired by @felixgeelhaar/cclint command-safety rule
 */
const DANGEROUS_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  severity: "error" | "warning";
}> = [
  // Destructive commands
  {
    pattern: /rm\s+(-rf?|--force)\s+[/~]/,
    message: "Dangerous: rm with force flag on root/home path",
    severity: "error",
  },
  {
    pattern: /rm\s+-rf?\s+\$[A-Z_]+/,
    message: "Dangerous: rm with force flag on variable (could be empty)",
    severity: "warning",
  },
  {
    pattern: />\s*\/dev\/sd[a-z]/,
    message: "Dangerous: writing directly to disk device",
    severity: "error",
  },
  {
    pattern: /mkfs\./,
    message: "Dangerous: filesystem formatting command",
    severity: "error",
  },
  {
    pattern: /dd\s+.*of=\/dev\//,
    message: "Dangerous: dd writing to device",
    severity: "error",
  },

  // Remote code execution
  {
    pattern: /curl\s+.*\|\s*(ba)?sh/,
    message: "Dangerous: piping curl to shell (remote code execution)",
    severity: "error",
  },
  {
    pattern: /wget\s+.*\|\s*(ba)?sh/,
    message: "Dangerous: piping wget to shell (remote code execution)",
    severity: "error",
  },
  {
    pattern: /curl\s+.*>\s*.*\.sh\s*&&\s*(ba)?sh/,
    message: "Dangerous: downloading and executing script",
    severity: "warning",
  },

  // Privilege escalation without audit trail
  {
    pattern: /chmod\s+777/,
    message: "Insecure: chmod 777 grants all permissions",
    severity: "warning",
  },
  {
    pattern: /chmod\s+\+s/,
    message: "Dangerous: setting SUID/SGID bit",
    severity: "error",
  },

  // Missing error handling
  {
    pattern: /^(?!.*set\s+-e).*&&.*&&.*&&/m,
    message: "Consider: Long command chain without 'set -e' for error handling",
    severity: "warning",
  },
];

/**
 * Patterns that indicate good practices (reduce false positives)
 */
const SAFE_CONTEXTS = [
  /set\s+-e/, // Script has error handling
  /\|\|\s*exit/, // Has exit on failure
  /\|\|\s*:/, // Has null command fallback
  /--dry-run/, // Dry run mode
  /#.*example/i, // Commented as example
  /#.*don't|do not/i, // Negative example
];

/** Shell-like languages to check for dangerous patterns */
const BASH_LANGUAGES = new Set(["bash", "sh", "shell", "zsh", ""]);

/**
 * Check if a language string indicates a bash/shell block
 */
function isBashLanguage(lang: string): boolean {
  return BASH_LANGUAGES.has(lang.toLowerCase());
}

/**
 * Process a code block start line and return language info
 */
function parseCodeBlockStart(line: string): { isBash: boolean } {
  const lang = line.slice(3).trim();
  return { isBash: isBashLanguage(lang) };
}

interface BashBlockState {
  inBlock: boolean;
  blockStart: number;
  blockContent: string[];
  isBash: boolean;
}

/**
 * Handle the start of a code block
 */
function handleBashBlockStart(line: string, lineIndex: number, state: BashBlockState): void {
  state.inBlock = true;
  state.blockStart = lineIndex + 1;
  state.blockContent = [];
  state.isBash = parseCodeBlockStart(line).isBash;
}

/**
 * Handle the end of a code block
 */
function handleBashBlockEnd(
  state: BashBlockState,
  blocks: Array<{ code: string; line: number }>,
): void {
  if (state.isBash && state.blockContent.length > 0) {
    blocks.push({ code: state.blockContent.join("\n"), line: state.blockStart + 1 });
  }
  state.inBlock = false;
  state.isBash = false;
}

/**
 * Process a single line during bash block extraction
 */
function processBashBlockLine(
  line: string,
  lineIndex: number,
  state: BashBlockState,
  blocks: Array<{ code: string; line: number }>,
): void {
  if (line.startsWith("```")) {
    if (!state.inBlock) {
      handleBashBlockStart(line, lineIndex, state);
    } else {
      handleBashBlockEnd(state, blocks);
    }
  } else if (state.inBlock) {
    state.blockContent.push(line);
  }
}

/**
 * Extract bash code blocks from markdown content
 */
function extractBashBlocks(content: string): Array<{ code: string; line: number }> {
  const blocks: Array<{ code: string; line: number }> = [];
  const lines = content.split("\n");
  const state: BashBlockState = { inBlock: false, blockStart: 0, blockContent: [], isBash: false };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    processBashBlockLine(line, i, state, blocks);
  }

  return blocks;
}

/**
 * Check if a code block has safe context indicators
 */
function hasSafeContext(code: string): boolean {
  return SAFE_CONTEXTS.some((pattern) => pattern.test(code));
}

/**
 * Validate command safety in markdown files
 *
 * Detects dangerous bash patterns that could be harmful if executed.
 * Helps prevent accidental inclusion of destructive commands in docs.
 *
 * Inspired by @felixgeelhaar/cclint
 */
export function validateCommandSafety(filePath: string, content: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const bashBlocks = extractBashBlocks(content);

  for (const block of bashBlocks) {
    // Skip blocks with safe context
    if (hasSafeContext(block.code)) {
      continue;
    }

    for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
      if (pattern.test(block.code)) {
        errors.push({
          file: filePath,
          line: block.line,
          severity,
          source: "structure",
          message: `Command safety: ${message}`,
          ruleId: "command-safety",
        });
      }
    }
  }

  return errors;
}

/**
 * Check if a specific command is safe
 * Utility for programmatic use
 */
export function isCommandSafe(command: string): {
  safe: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      issues.push(message);
    }
  }

  return {
    safe: !issues.length,
    issues,
  };
}
