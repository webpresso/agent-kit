import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { planAffectedTypecheckClosure, runAffectedTypecheck } from "./affected.js";

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

  it("reports diagnostics in unchanged importers included by the closure", async () => {
    const root = makeProject();
    write(root, "src/a.ts", "export interface Shape { value: string }\n");
    write(
      root,
      "src/b.ts",
      "import type { Shape } from './a';\nexport const b: Shape = { value: 1 };\n",
    );

    const result = await runAffectedTypecheck({ repoRoot: root, files: ["src/a.ts"] });

    expect(result.exitCode).toBe(1);
    expect(result.checkedFiles).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("treats affected files outside the active TypeScript program as a successful no-op", async () => {
    const root = makeProject();
    write(root, "src/a.ts", "export const value = 1;\n");
    write(root, "README.md", "# docs only\n");

    const result = await runAffectedTypecheck({ repoRoot: root, files: ["README.md"] });

    expect(result.exitCode).toBe(0);
    expect(result.checkedFiles).toEqual([]);
  });
});
