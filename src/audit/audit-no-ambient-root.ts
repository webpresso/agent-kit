/**
 * Audit: No Ambient Root Resolution
 *
 * Pure detection function — no filesystem reads.
 * Given an array of {path, contents} file objects, detects patterns that
 * indicate ambient (implicit cwd-based) root resolution:
 *
 *   - calls to findRepoRoot(, findRootSync(, findProjectRoot(
 *   - top-level `const <X> = ...<anything containing Root>...()` assignments
 *   - `= process.cwd()` as a default argument in function signatures
 *     (library functions; not in shell/entry-point files)
 */

export interface AmbientRootViolation {
  path: string
  line: number
  pattern: string
  message: string
}

export interface AmbientRootAuditResult {
  violations: AmbientRootViolation[]
}

// Patterns that directly call root-resolution helpers
const DIRECT_CALL_PATTERNS: Array<{ re: RegExp; pattern: string; message: string }> = [
  {
    re: /\bfindRepoRoot\s*\(/,
    pattern: 'findRepoRoot(',
    message:
      'Direct call to findRepoRoot() detected. Pass workspace root as an explicit argument instead.',
  },
  {
    re: /\bfindRootSync\s*\(/,
    pattern: 'findRootSync(',
    message:
      'Direct call to findRootSync() detected. Pass workspace root as an explicit argument instead.',
  },
  {
    re: /\bfindProjectRoot\s*\(/,
    pattern: 'findProjectRoot(',
    message:
      'Direct call to findProjectRoot() detected. Pass workspace root as an explicit argument instead.',
  },
]

// Top-level `const FOO = ...Root...()` — module-scope side effect
const TOP_LEVEL_ROOT_CONST_RE = /^(?:export\s+)?const\s+\w+\s*=\s*[^(]*Root[^(]*\(/

// Default parameter `= process.cwd()` in function signatures
const DEFAULT_CWD_PARAM_RE = /=\s*process\.cwd\(\)\s*[,)]/

function detectInFile(filePath: string, contents: string): AmbientRootViolation[] {
  const violations: AmbientRootViolation[] = []
  const lines = contents.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const lineNumber = i + 1

    // Skip comment lines
    const trimmed = line.trimStart()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue
    }

    // Direct root-finder calls
    for (const { re, pattern, message } of DIRECT_CALL_PATTERNS) {
      if (re.test(line)) {
        violations.push({ path: filePath, line: lineNumber, pattern, message })
      }
    }

    // Top-level `const X = ...Root...()` — module-scope side effect (anchored at line start)
    if (TOP_LEVEL_ROOT_CONST_RE.test(line)) {
      violations.push({
        path: filePath,
        line: lineNumber,
        pattern: 'const <X> = ...Root...()',
        message:
          'Module-scope root constant detected. Root resolution at import time crashes test workers. Move into a function and pass root as an explicit parameter.',
      })
    }

    // `= process.cwd()` default argument in function signatures
    if (DEFAULT_CWD_PARAM_RE.test(line) && /\bfunction\b|\(.*:.*string\s*=/.test(line)) {
      violations.push({
        path: filePath,
        line: lineNumber,
        pattern: '= process.cwd()',
        message:
          'Default `= process.cwd()` parameter in function signature detected. Library functions must accept an explicit root argument; reserve process.cwd() for CLI entry points.',
      })
    }
  }

  return violations
}

/**
 * Pure detection over the passed-in file array — no filesystem reads.
 */
export function detectAmbientRoot(
  files: Array<{ path: string; contents: string }>,
): AmbientRootAuditResult {
  const violations: AmbientRootViolation[] = []
  for (const file of files) {
    violations.push(...detectInFile(file.path, file.contents))
  }
  return { violations }
}
