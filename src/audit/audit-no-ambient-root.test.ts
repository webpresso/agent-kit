import { describe, expect, it } from "vitest";

import { detectAmbientRoot } from "./audit-no-ambient-root.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function file(path: string, contents: string) {
  return { path, contents };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectAmbientRoot", () => {
  describe("findRepoRoot( detection", () => {
    it("flags direct call to findRepoRoot() in a non-const expression", () => {
      const result = detectAmbientRoot([file("src/foo.ts", "return findRepoRoot()")]);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.pattern).toBe("findRepoRoot(");
    });

    it("flags findRepoRoot at top-level const (two patterns fire)", () => {
      const result = detectAmbientRoot([file("src/foo.ts", "const repoRoot = findRepoRoot()")]);
      // Both findRepoRoot( AND top-level const Root pattern fire
      const patterns = result.violations.map((v) => v.pattern);
      expect(patterns).toContain("findRepoRoot(");
      expect(patterns).toContain("const <X> = ...Root...()");
    });

    it("does not flag comment lines mentioning findRepoRoot(", () => {
      const result = detectAmbientRoot([
        file("src/foo.ts", "// findRepoRoot( is described here\n* @param findRepoRoot("),
      ]);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("findRootSync( detection", () => {
    it("flags direct call to findRootSync()", () => {
      const result = detectAmbientRoot([
        file("src/state.ts", "const { rootDir } = findRootSync(process.cwd())"),
      ]);
      expect(result.violations.some((v) => v.pattern === "findRootSync(")).toBe(true);
    });

    it("does not flag string containing findRootSync in a comment", () => {
      const result = detectAmbientRoot([file("src/state.ts", "// uses findRootSync( internally")]);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("findProjectRoot( detection", () => {
    it("flags direct call to findProjectRoot()", () => {
      const result = detectAmbientRoot([
        file("src/cli/utils.ts", "export function findProjectRoot(startDir: string): string {"),
      ]);
      // function declaration contains findProjectRoot( — flagged
      expect(result.violations.some((v) => v.pattern === "findProjectRoot(")).toBe(true);
    });
  });

  describe("top-level const Root pattern", () => {
    it("flags module-scope const assignment containing Root and a call", () => {
      const result = detectAmbientRoot([
        file("src/audit/audit-tph.ts", "const REPO_ROOT = findRepoRoot()"),
      ]);
      const patterns = result.violations.map((v) => v.pattern);
      expect(patterns).toContain("const <X> = ...Root...()");
    });

    it("flags exported module-scope const Root", () => {
      const result = detectAmbientRoot([
        file("src/audit/foo.ts", "export const PROJECT_ROOT = findRepoRoot()"),
      ]);
      const patterns = result.violations.map((v) => v.pattern);
      expect(patterns).toContain("const <X> = ...Root...()");
    });

    it("does not flag const Root inside a function body (indented) for the top-level pattern", () => {
      const result = detectAmbientRoot([
        file("src/foo.ts", "  const root = findRepoRoot()\n  return root"),
      ]);
      // indented line does NOT match TOP_LEVEL_ROOT_CONST_RE (which anchors at line start)
      // but findRepoRoot( pattern still fires on the same line
      const topLevelViolations = result.violations.filter(
        (v) => v.pattern === "const <X> = ...Root...()",
      );
      expect(topLevelViolations).toHaveLength(0);
      // The findRepoRoot( pattern still fires
      expect(result.violations.some((v) => v.pattern === "findRepoRoot(")).toBe(true);
    });

    it("does not flag const that does not contain Root", () => {
      const result = detectAmbientRoot([file("src/foo.ts", "const config = loadConfig()")]);
      expect(
        result.violations.filter((v) => v.pattern === "const <X> = ...Root...()"),
      ).toHaveLength(0);
    });
  });

  describe("= process.cwd() default parameter", () => {
    it("flags default cwd param in function signature", () => {
      const result = detectAmbientRoot([
        file(
          "src/cli/utils.ts",
          "export function findProjectRoot(startDir: string = process.cwd()): string {",
        ),
      ]);
      const patterns = result.violations.map((v) => v.pattern);
      expect(patterns).toContain("= process.cwd()");
    });

    it("does not flag process.cwd() as a plain call expression (not default param)", () => {
      const result = detectAmbientRoot([file("src/cli/cli.ts", "const root = process.cwd()")]);
      expect(result.violations.filter((v) => v.pattern === "= process.cwd()")).toHaveLength(0);
    });
  });

  describe("multiple files", () => {
    it("aggregates violations across files", () => {
      const result = detectAmbientRoot([
        file("src/a.ts", "const REPO_ROOT = findRepoRoot()"),
        file("src/b.ts", "const REPO_ROOT = findRepoRoot()"),
      ]);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
      const paths = result.violations.map((v) => v.path);
      expect(paths).toContain("src/a.ts");
      expect(paths).toContain("src/b.ts");
    });
  });

  describe("clean files", () => {
    it("returns no violations for clean code", () => {
      const result = detectAmbientRoot([
        file(
          "src/audit/clean.ts",
          [
            "export function runAudit(root: string): void {",
            "  const files = findFiles(root)",
            "  return files",
            "}",
          ].join("\n"),
        ),
      ]);
      expect(result.violations).toHaveLength(0);
    });
  });
});
