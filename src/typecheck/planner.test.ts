import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { planTypecheckExecution } from "./planner.js";

interface WorkspaceFixture {
  readonly root: string;
  readonly rootFile: string;
  readonly fooFile: string;
  readonly barFile: string;
  readonly fooFileSymlink: string;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function createWorkspaceFixture(): WorkspaceFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wp-typecheck-plan-")));

  write(
    join(root, "package.json"),
    JSON.stringify({ name: "@webpresso/agent-kit", private: true, scripts: {} }),
  );
  write(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n  - apps/*\n");
  write(join(root, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n');

  const rootFile = join(root, "src/root.ts");
  const fooFile = join(root, "packages/foo/src/foo.ts");
  const barFile = join(root, "apps/bar/src/bar.ts");

  write(rootFile, "export const rootValue = 1\n");
  write(
    join(root, "packages/foo/package.json"),
    JSON.stringify({ name: "@scope/foo", private: true }),
  );
  write(join(root, "packages/foo/tsconfig.json"), '{"compilerOptions":{"strict":true}}\n');
  write(fooFile, "export const fooValue = 1\n");

  write(join(root, "apps/bar/package.json"), JSON.stringify({ name: "@scope/bar", private: true }));
  write(join(root, "apps/bar/tsconfig.json"), '{"compilerOptions":{"strict":true}}\n');
  write(barFile, "export const barValue = 1\n");

  const fooFileSymlink = join(root, "src/foo-symlink.ts");
  symlinkSync(relative(dirname(fooFileSymlink), fooFile), fooFileSymlink);

  return { root, rootFile, fooFile, barFile, fooFileSymlink };
}

describe("planTypecheckExecution", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture(): WorkspaceFixture {
    const created = createWorkspaceFixture();
    tempRoots.push(created.root);
    return created;
  }

  it("resolves a root-owned file to the root scope", () => {
    const ws = fixture();

    const plan = planTypecheckExecution({
      repoRoot: ws.root,
      files: [ws.rootFile],
    });

    expect(plan.resolvedScopes.map((scope) => scope.name)).toEqual(["@webpresso/agent-kit"]);
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]?.cwd).toBe(ws.root);
    expect(plan.preambleLine).toBe("Resolved typecheck scopes: @webpresso/agent-kit");
  });

  it("resolves a nested workspace file to its owning package scope", () => {
    const ws = fixture();

    const plan = planTypecheckExecution({
      repoRoot: ws.root,
      files: [ws.fooFile],
    });

    expect(plan.resolvedScopes.map((scope) => scope.name)).toEqual(["@scope/foo"]);
    expect(plan.commands[0]?.cwd).toBe(join(ws.root, "packages/foo"));
    const command = plan.commands[0];
    expect(command).toBeDefined();
    expect([command?.command, ...(command?.args ?? [])].join(" ")).toContain("typescript");
    expect(command?.args).toEqual(expect.arrayContaining(["--noEmit", "--pretty", "false"]));
  });

  it("resolves mixed root and nested files to both scopes once", () => {
    const ws = fixture();

    const plan = planTypecheckExecution({
      repoRoot: ws.root,
      files: [ws.rootFile, ws.fooFile, ws.fooFile],
    });

    expect(plan.resolvedScopes.map((scope) => scope.name)).toEqual([
      "@webpresso/agent-kit",
      "@scope/foo",
    ]);
    expect(plan.commands.map((command) => command.cwd)).toEqual([
      ws.root,
      join(ws.root, "packages/foo"),
    ]);
  });

  it("resolves exact package names only", () => {
    const ws = fixture();

    const plan = planTypecheckExecution({
      repoRoot: ws.root,
      packages: ["@scope/foo", "@scope/bar"],
    });

    expect(plan.resolvedScopes.map((scope) => scope.name)).toEqual(["@scope/foo", "@scope/bar"]);
  });

  it("rejects fuzzy or nonexistent package names clearly", () => {
    const ws = fixture();

    expect(() =>
      planTypecheckExecution({
        repoRoot: ws.root,
        packages: ["foo"],
      }),
    ).toThrow(/exact package\.json name/i);
  });

  it("rejects nonexistent file targets clearly", () => {
    const ws = fixture();

    expect(() =>
      planTypecheckExecution({
        repoRoot: ws.root,
        files: ["src/missing.ts"],
      }),
    ).toThrow(/Typecheck target not found/i);
  });

  it("rejects generated and output targets clearly", () => {
    const ws = fixture();
    write(join(ws.root, "dist/generated.ts"), "export const generatedValue = 1\n");

    expect(() =>
      planTypecheckExecution({
        repoRoot: ws.root,
        files: ["dist/generated.ts"],
      }),
    ).toThrow(/generated\/output target/i);
  });

  it("uses realpath normalization so symlinked files resolve to the owning package scope", () => {
    const ws = fixture();

    const plan = planTypecheckExecution({
      repoRoot: ws.root,
      files: [ws.fooFileSymlink],
    });

    expect(plan.resolvedScopes.map((scope) => scope.name)).toEqual(["@scope/foo"]);
  });

  it("fails clearly when a resolved scope has no valid typecheck contract", () => {
    const ws = fixture();
    write(
      join(ws.root, "packages/no-contract/package.json"),
      JSON.stringify({ name: "@scope/no-contract", private: true }),
    );
    write(join(ws.root, "packages/no-contract/src/index.ts"), "export const nope = 1\n");

    expect(() =>
      planTypecheckExecution({
        repoRoot: ws.root,
        files: ["packages/no-contract/src/index.ts"],
      }),
    ).toThrow(/no non-recursive check-types script and no tsconfig\.json/i);
  });
});
