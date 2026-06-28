import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectAffectedDiagnostics,
  planAffectedTypecheckClosure,
  filterActiveTypecheckFiles,
  planAffectedTypecheckClosures,
  runAffectedTypecheck,
} from "./affected.js";

const tempDirs: string[] = [];

function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "wp-affected-typecheck-"));
  tempDirs.push(root);
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "#lib/*": ["src/*"] },
        },
        include: ["src/**/*.ts"],
        exclude: ["**/*.test.ts"],
      },
      null,
      2,
    ),
    "utf8",
  );
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("affected typecheck closure", () => {
  it("includes unchanged transitive importers of changed files", () => {
    const root = makeProject();
    write(root, "src/a.ts", "export interface Shape { value: string }\n");
    write(
      root,
      "src/b.ts",
      "import type { Shape } from './a';\nexport const b: Shape = { value: 1 };\n",
    );
    write(root, "src/c.ts", "import { b } from './b';\nexport const c = b;\n");

    const plan = planAffectedTypecheckClosure({ repoRoot: root, files: ["src/a.ts"] });

    expect(
      plan.closureFiles.map((file) => path.relative(root, file.fileName).replaceAll("\\", "/")),
    ).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("resolves tsconfig path aliases when building the reverse closure", () => {
    const root = makeProject();
    write(root, "src/a.ts", "export interface Shape { value: string }\n");
    write(
      root,
      "src/aliased.ts",
      "import type { Shape } from '#lib/a';\nexport const b: Shape = { value: 1 };\n",
    );

    const plan = planAffectedTypecheckClosure({ repoRoot: root, files: ["src/a.ts"] });

    expect(
      plan.closureFiles.map((file) => path.relative(root, file.fileName).replaceAll("\\", "/")),
    ).toEqual(["src/a.ts", "src/aliased.ts"]);
  });

  it("returns a failing public result when unchanged importers have diagnostics", async () => {
    const root = makeProject();
    write(root, "src/a.ts", "export interface Shape { value: string }\n");
    write(
      root,
      "src/b.ts",
      "import type { Shape } from './a';\nexport const b: Shape = { value: 1 };\n",
    );

    const result = await runAffectedTypecheck({ repoRoot: root, files: ["src/a.ts"] });

    expect(result.exitCode).toBe(1);
    expect(result.entry.exitCode).toBe(1);
    expect(result.entry.summary).toBe("typecheck failed (exit 1)");
    expect(result.checkedFiles).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("reports diagnostics in unchanged importers included by the closure", () => {
    const root = makeProject();
    write(root, "src/a.ts", "export interface Shape { value: string }\n");
    write(
      root,
      "src/b.ts",
      "import type { Shape } from './a';\nexport const b: Shape = { value: 1 };\n",
    );

    const plan = planAffectedTypecheckClosure({ repoRoot: root, files: ["src/a.ts"] });
    const checkedFiles = plan.closureFiles.map((file) =>
      path.relative(root, file.fileName).replaceAll("\\", "/"),
    );
    const diagnostics = collectAffectedDiagnostics(plan.program, plan.closureFiles);
    const fileDiagnostics = diagnostics.filter(
      (
        diagnostic,
      ): diagnostic is typeof diagnostic & { file: NonNullable<typeof diagnostic.file> } =>
        diagnostic.file !== undefined,
    );
    const fileDiagnosticSummaries = fileDiagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      file: path.relative(root, diagnostic.file.fileName).replaceAll("\\", "/"),
      message: String(diagnostic.messageText),
    }));

    expect(checkedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(fileDiagnosticSummaries).toEqual([
      {
        code: 2322,
        file: "src/b.ts",
        message: "Type 'number' is not assignable to type 'string'.",
      },
    ]);
  });
});

function makePackage(root: string, name: string): void {
  const pkgDir = path.join(root, "packages", name);
  mkdirSync(path.join(pkgDir, "src"), { recursive: true });
  writeFileSync(
    path.join(pkgDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "Bundler",
        },
        include: ["src/**/*.ts"],
        exclude: ["**/*.test.ts"],
      },
      null,
      2,
    ),
    "utf8",
  );
}

function configRelative(root: string, configPath: string): string {
  return path.relative(root, configPath).replaceAll("\\", "/");
}

describe("affected typecheck closures across owning tsconfigs", () => {
  it("plans a closure for a packages/* file in its own tsconfig (no fail-closed)", () => {
    const root = makeProject();
    makePackage(root, "pkg-a");
    write(root, "packages/pkg-a/src/a.ts", "export const a: string = 'ok';\n");

    const plans = planAffectedTypecheckClosures({
      repoRoot: root,
      files: ["packages/pkg-a/src/a.ts"],
    });

    expect(plans).toHaveLength(1);
    expect(configRelative(root, plans[0]!.configPath)).toBe("packages/pkg-a/tsconfig.json");
    expect(
      plans[0]!.closureFiles.map((file) =>
        path.relative(root, file.fileName).replaceAll("\\", "/"),
      ),
    ).toEqual(["packages/pkg-a/src/a.ts"]);
  });

  it("plans separate closures for a mixed root + package change", () => {
    const root = makeProject();
    makePackage(root, "pkg-a");
    write(root, "src/x.ts", "export const x = 1;\n");
    write(root, "packages/pkg-a/src/a.ts", "export const a = 2;\n");

    const plans = planAffectedTypecheckClosures({
      repoRoot: root,
      files: ["src/x.ts", "packages/pkg-a/src/a.ts"],
    });

    expect(plans.map((plan) => configRelative(root, plan.configPath))).toEqual([
      "packages/pkg-a/tsconfig.json",
      "tsconfig.json",
    ]);
  });

  it("filters changed TS files to files covered by an active TypeScript program", () => {
    const root = makeProject();
    write(root, "src/covered.ts", "export const covered = 1;\n");
    write(root, "src/covered.test.ts", "export const testOnly = 1;\n");
    write(root, "bin/tool.test.ts", "export const binTest = 1;\n");

    expect(
      filterActiveTypecheckFiles({
        repoRoot: root,
        files: ["src/covered.ts", "src/covered.test.ts", "bin/tool.test.ts"],
      }),
    ).toEqual(["src/covered.ts"]);
  });

  it("fail-closes when a changed file is inside no active TypeScript program", () => {
    const root = makeProject();
    // A valid src file keeps the root tsconfig program non-empty...
    write(root, "src/keep.ts", "export const keep = 1;\n");
    // ...but `scripts/foo.ts` is outside the root include (src/**) and under no
    // package tsconfig, so no program governs the changed file.
    write(root, "scripts/foo.ts", "export const foo = 1;\n");

    expect(() =>
      planAffectedTypecheckClosures({ repoRoot: root, files: ["scripts/foo.ts"] }),
    ).toThrow(/no changed files inside any active TypeScript program/);
  });

  it("reports diagnostics found inside a package program", async () => {
    const root = makeProject();
    makePackage(root, "pkg-a");
    write(root, "packages/pkg-a/src/a.ts", "export const a: string = 1;\n");

    const result = await runAffectedTypecheck({
      repoRoot: root,
      files: ["packages/pkg-a/src/a.ts"],
    });

    expect(result.exitCode).toBe(1);
    expect(result.checkedFiles).toEqual(["packages/pkg-a/src/a.ts"]);
  });
});
