#!/usr/bin/env node
#!/usr/bin/env node

// ../agent-kit/src/hooks/shared/worktree-root.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
function findRepoRoot(startDir) {
  let current = resolve(startDir);
  for (; ; ) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error(`Could not find repo root from: ${startDir}`);
    current = parent;
  }
}
function resolveActiveWorktreeRoot(cwd = process.cwd()) {
  try {
    const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const gitCommonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (gitDir && gitCommonDir && gitDir !== gitCommonDir) {
      const gitDirAbs = isAbsolute(gitDir) ? gitDir : resolve(cwd, gitDir);
      const worktreeGitPath = readFileSync(resolve(gitDirAbs, "gitdir"), "utf8").trim();
      if (worktreeGitPath.length > 0) return dirname(worktreeGitPath);
    }
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (gitRoot.length > 0) return gitRoot;
  } catch {
  }
  return findRepoRoot(cwd);
}

// ../agent-kit/src/hooks/test-quality-check.ts
import { readFileSync as readFileSync2, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute as isAbsolute2, join as join2 } from "node:path";

// ../agent-kit/src/hooks/pretool-guard/validators/test-quality.ts
var MUTATION_GAMING_PATTERNS = [
  { pattern: /mutation[_-]kill/i, description: "File name suggests mutation gaming", fileLevel: true },
  { pattern: /kill[_-]mutant/i, description: "File name suggests mutation gaming", fileLevel: true },
  { pattern: /for[_-]coverage/i, description: "File name suggests coverage gaming", fileLevel: true },
  { pattern: /increase[_-]mutation/i, description: "File name suggests mutation gaming", fileLevel: true },
  { pattern: /describe\s*\(\s*['"`].*mutation[_-]kill/i, description: "Test suite name suggests mutation gaming" },
  { pattern: /describe\s*\(\s*['"`].*kill[_-]mutant/i, description: "Test suite name suggests mutation gaming" },
  { pattern: /it\s*\(\s*['"`].*kill\s+(the\s+)?mutant/i, description: "Test name suggests mutation gaming" },
  { pattern: /it\s*\(\s*['"`].*for\s+mutation\s+score/i, description: "Test name suggests mutation gaming" },
  { pattern: /it\s*\(\s*['"`].*increase\s+(mutation|coverage)/i, description: "Test name suggests coverage gaming" }
];
var TAUTOLOGICAL_PATTERNS = [
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/, description: "expect(true).toBe(true)" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBe\s*\(\s*false\s*\)/, description: "expect(false).toBe(false)" },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toEqual\s*\(\s*true\s*\)/, description: "expect(true).toEqual(true)" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toEqual\s*\(\s*false\s*\)/, description: "expect(false).toEqual(false)" },
  { pattern: /expect\s*\(\s*null\s*\)\s*\.toBe\s*\(\s*null\s*\)/, description: "expect(null).toBe(null)" },
  { pattern: /expect\s*\(\s*undefined\s*\)\s*\.toBe\s*\(\s*undefined\s*\)/, description: "expect(undefined).toBe(undefined)" },
  { pattern: /expect\s*\(\s*null\s*\)\s*\.toEqual\s*\(\s*null\s*\)/, description: "expect(null).toEqual(null)" },
  { pattern: /expect\s*\(\s*undefined\s*\)\s*\.toEqual\s*\(\s*undefined\s*\)/, description: "expect(undefined).toEqual(undefined)" },
  { pattern: /expect\s*\(\s*\[\s*\]\s*\)\s*\.toEqual\s*\(\s*\[\s*\]\s*\)/, description: "expect([]).toEqual([])" },
  { pattern: /expect\s*\(\s*\{\s*\}\s*\)\s*\.toEqual\s*\(\s*\{\s*\}\s*\)/, description: "expect({}).toEqual({})" },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: "expect(true).toBeTruthy()" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: "expect(false).toBeFalsy()" },
  { pattern: /expect\s*\(\s*1\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: "expect(1).toBeTruthy()" },
  { pattern: /expect\s*\(\s*0\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: "expect(0).toBeFalsy()" },
  { pattern: /expect\s*\(\s*["'][^"']+["']\s*\)\s*\.toBeTruthy\s*\(\s*\)/, description: 'expect("string").toBeTruthy()' },
  { pattern: /expect\s*\(\s*["']["']\s*\)\s*\.toBeFalsy\s*\(\s*\)/, description: 'expect("").toBeFalsy()' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: "expect(true).toBeDefined()" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: "expect(false).toBeDefined()" },
  { pattern: /expect\s*\(\s*\d+\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: "expect(number).toBeDefined()" },
  { pattern: /expect\s*\(\s*["'][^"']*["']\s*\)\s*\.toBeDefined\s*\(\s*\)/, description: 'expect("string").toBeDefined()' },
  { pattern: /expect\s*\(\s*true\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: "expect(true).toBeInstanceOf(Object)" },
  { pattern: /expect\s*\(\s*false\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: "expect(false).toBeInstanceOf(Object)" },
  { pattern: /expect\s*\(\s*\d+\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: "expect(number).toBeInstanceOf(Object)" },
  { pattern: /expect\s*\(\s*["'][^"']*["']\s*\)\s*\.toBeInstanceOf\s*\(\s*Object\s*\)/, description: 'expect("string").toBeInstanceOf(Object)' }
];
function findTautologicalAssertions(content) {
  const lines = content.split("\n");
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { pattern, description } of TAUTOLOGICAL_PATTERNS) {
      const match = line.match(pattern);
      if (match) matches.push({ line: i + 1, pattern: description, match: match[0] });
    }
  }
  return matches;
}
function findMutationGamingPatterns(content, filePath) {
  const matches = [];
  if (filePath) {
    for (const { pattern, description, fileLevel } of MUTATION_GAMING_PATTERNS) {
      if (!fileLevel) continue;
      const match = filePath.match(pattern);
      if (match) matches.push({ line: 0, pattern: description, match: match[0] });
    }
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    for (const { pattern, description, fileLevel } of MUTATION_GAMING_PATTERNS) {
      if (fileLevel) continue;
      const match = line.match(pattern);
      if (match) matches.push({ line: i + 1, pattern: description, match: match[0] });
    }
  }
  return matches;
}

// ../agent-kit/src/hooks/test-quality-check.ts
var testFileRegex = /\.test\.(ts|tsx|js|jsx)$/;
function getTestQualityCheckCwd() {
  return resolveActiveWorktreeRoot(process.cwd());
}
function resolveTestFilePath(filePath, cwd = getTestQualityCheckCwd()) {
  return isAbsolute2(filePath) ? filePath : join2(cwd, filePath);
}
function runTestQualityCheck(argv = process.argv.slice(2), cwd = getTestQualityCheckCwd()) {
  const testFiles = argv.filter((filePath) => testFileRegex.test(filePath));
  if (testFiles.length === 0) return;
  let hasFailures = false;
  const failureLines = [];
  for (const filePath of testFiles) {
    if (filePath.includes("test-quality.test.ts")) continue;
    try {
      const resolvedPath = resolveTestFilePath(filePath, cwd);
      const content = readFileSync2(resolvedPath, "utf8");
      const gamingMatches = findMutationGamingPatterns(content, filePath);
      if (gamingMatches.length > 0) {
        hasFailures = true;
        failureLines.push(`\u274C ${filePath}`);
        for (const match of gamingMatches) {
          failureLines.push(match.line === 0 ? `  File path: ${match.pattern}` : `  Line ${match.line}: ${match.pattern}`);
        }
      }
      const matches = findTautologicalAssertions(content);
      if (matches.length > 0) {
        hasFailures = true;
        failureLines.push(`\u274C ${filePath}`);
        for (const match of matches) failureLines.push(`  Line ${match.line}: ${match.pattern}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\u274C Failed to read ${filePath}: ${message}`);
      throw error;
    }
  }
  if (hasFailures) {
    console.error(`Test quality issues detected (${MUTATION_GAMING_PATTERNS.length} gaming patterns + ${TAUTOLOGICAL_PATTERNS.length} tautology patterns checked):`);
    for (const line of failureLines) console.error(line);
    process.exit(1);
  }
}
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runTestQualityCheck();
}
export {
  getTestQualityCheckCwd,
  resolveTestFilePath,
  runTestQualityCheck
};
