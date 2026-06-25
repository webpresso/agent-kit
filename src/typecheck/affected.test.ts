import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectAffectedDiagnostics, planAffectedTypecheckClosure } from "./affected.js";

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
