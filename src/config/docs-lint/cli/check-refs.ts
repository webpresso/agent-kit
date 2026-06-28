#!/usr/bin/env bun
/**
 * Dead Reference Detection
 *
 * Finds documentation that references code files that no longer exist.
 * Helps identify stale docs that need updating after code refactors.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { glob } from "glob";

const DOCS_ROOT = process.cwd();

interface DeadRef {
  docFile: string;
  line: number;
  reference: string;
  type: "file" | "directory";
}

/** File path patterns to extract from docs */
const FILE_PATTERNS = [
  // Explicit file paths in backticks: `src/handlers/foo.ts`
  /`((?:apps|packages|tooling|infra|scripts|e2e)\/[a-zA-Z0-9\-_/.]+\.[a-zA-Z]+)`/g,
  // File paths in markdown links: [text](src/foo.ts)
  /\]\(((?:apps|packages|tooling|infra|scripts|e2e)\/[a-zA-Z0-9\-_/.]+\.[a-zA-Z]+)/g,
  // Path patterns after "in" or "at": in src/handlers/foo.ts
  /(?:in|at|from|see)\s+`?((?:apps|packages|tooling|infra|scripts|e2e)\/[a-zA-Z0-9\-_/.]+\.[a-zA-Z]+)`?/gi,
];

/** Directory patterns */
const DIR_PATTERNS = [
  // Directory paths in backticks: `apps/workers/chef/`
  /`((?:apps|packages|tooling|infra|scripts|e2e)\/[a-zA-Z0-9\-_/]+\/)`/g,
];

/** Patterns to skip (templates, examples) */
const SKIP_PATTERNS = [
  /\$\{/, // Template literals
  /\*/, // Glob patterns
  /\.\.\./, // Ellipsis in paths
  /<[^>]+>/, // Placeholder paths
  /example/i, // Example paths
];

function shouldSkip(ref: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(ref));
}

type RefType = "file" | "directory";
type ExtractedRef = { ref: string; line: number; type: RefType };

/**
 * Extract a single match from a regex execution
 */
function extractMatchRef(match: RegExpExecArray | null, type: RefType): string | null {
  if (!match?.[1]) return null;
  const ref = type === "directory" ? match[1].replace(/\/$/, "") : match[1];
  return shouldSkip(ref) ? null : ref;
}

function extractPatternMatches(
  line: string,
  lineNum: number,
  patterns: RegExp[],
  type: RefType,
): ExtractedRef[] {
  const refs: ExtractedRef[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null = null;
    match = regex.exec(line);
    while (match !== null) {
      const ref = extractMatchRef(match, type);
      if (ref) {
        refs.push({ ref, line: lineNum, type });
      }
      match = regex.exec(line);
    }
  }
  return refs;
}

function dedupeRefs(refs: ExtractedRef[]): ExtractedRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.ref}:${r.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractRefs(content: string): ExtractedRef[] {
  const refs: ExtractedRef[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    if (!line || line.trimStart().startsWith("```")) continue;

    refs.push(...extractPatternMatches(line, lineNum, FILE_PATTERNS, "file"));
    refs.push(...extractPatternMatches(line, lineNum, DIR_PATTERNS, "directory"));
  }

  return dedupeRefs(refs);
}

function checkRefExists(ref: string): boolean {
  const fullPath = join(DOCS_ROOT, ref);
  return existsSync(fullPath);
}

export function validateFile(file: string): DeadRef[] {
  const dead: DeadRef[] = [];
  // existsSync follows symlinks, so a dangling symlink (e.g. a stale projected
  // agent-rule surface like `.claude/rules/*.md`) resolves to false. Skip it
  // with a warning instead of crashing the whole linter on ENOENT.
  if (!existsSync(file)) {
    console.warn(
      `⚠️  check-refs: skipping unreadable path (broken symlink): ${relative(DOCS_ROOT, file)}`,
    );
    return dead;
  }
  // Belt-and-suspenders: a path can exist at glob time but be unreadable
  // (EACCES, EISDIR, a special file, or removed before this read). Warn and
  // skip rather than crashing the whole linter.
  let content: string;
  try {
    content = readFileSync(file, "utf-8");
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `⚠️  check-refs: skipping unreadable path: ${relative(DOCS_ROOT, file)} (${reason})`,
    );
    return dead;
  }
  const refs = extractRefs(content);

  for (const { ref, line, type } of refs) {
    if (!checkRefExists(ref)) {
      dead.push({
        docFile: relative(DOCS_ROOT, file),
        line,
        reference: ref,
        type,
      });
    }
  }

  return dead;
}

/**
 * Group dead references by file
 */
function groupByFile(allDead: DeadRef[]): Map<string, DeadRef[]> {
  const byFile = new Map<string, DeadRef[]>();
  for (const dead of allDead) {
    const existing = byFile.get(dead.docFile) || [];
    existing.push(dead);
    byFile.set(dead.docFile, existing);
  }
  return byFile;
}

/**
 * Print dead reference report
 */
function printDeadRefReport(byFile: Map<string, DeadRef[]>): void {
  for (const [file, refs] of byFile) {
    console.log(`  ${file}:`);
    for (const { line, reference, type } of refs) {
      const icon = type === "directory" ? "📁" : "📄";
      console.log(`    L${line}: ${icon} ${reference}`);
    }
    console.log();
  }
}

async function main(): Promise<void> {
  const files = await glob(
    ["docs/**/*.md", "CLAUDE.md", ".agent/rules/agent-guide.md", ".claude/**/*.md"],
    {
      cwd: DOCS_ROOT,
      ignore: [
        "**/node_modules/**",
        ".claude/worktrees/**",
        ".tmp/**",
        "webpresso/blueprints/completed/**",
        "webpresso/blueprints/archived/**",
        "docs/evaluations/archive/**",
      ],
      absolute: true,
    },
  );

  let allDead: DeadRef[] = [];

  for (const file of files) {
    const dead = validateFile(file);
    allDead = allDead.concat(dead);
  }

  if (!allDead.length) {
    console.log(`✓ No dead code references found (checked ${files.length} docs)`);
    process.exit(0);
  }

  console.log(`\n⚠ Found ${allDead.length} dead reference(s) to non-existent code:\n`);

  const byFile = groupByFile(allDead);
  printDeadRefReport(byFile);

  console.log("These docs reference code that no longer exists.");
  console.log("Update the docs or remove stale references.\n");

  process.exit(0);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Error checking code references:", error);
    process.exit(1);
  });
}
