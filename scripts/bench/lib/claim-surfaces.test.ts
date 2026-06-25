import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { enumerateClaimSurfaces } from "./claim-surfaces";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wp-claim-surfaces-"));
}

function write(root: string, path: string, text: string): void {
  const full = join(root, path);
  const dir = full.slice(0, full.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, text, "utf8");
}

describe("enumerateClaimSurfaces", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("returns README.md as a surface", async () => {
    root = makeRoot();
    write(root, "README.md", "# Test README\nSome content");

    const surfaces = await enumerateClaimSurfaces(root);
    const paths = surfaces.map((s) => s.path);

    expect(paths).toContain(join(root, "README.md"));
  });

  it("does NOT return anything under docs/research/", async () => {
    root = makeRoot();
    write(root, "README.md", "# README");
    write(root, "docs/research/some-study.md", "# Research");
    write(root, "docs/overview.md", "# Overview");

    const surfaces = await enumerateClaimSurfaces(root);
    const paths = surfaces.map((s) => s.path);

    const researchPath = join(root, "docs", "research", "some-study.md");
    expect(paths).not.toContain(researchPath);
  });

  it("includes docs/ markdown files that are not under docs/research/", async () => {
    root = makeRoot();
    write(root, "README.md", "# README");
    write(root, "docs/overview.md", "# Overview");
    write(root, "docs/research/excluded.md", "# Excluded");

    const surfaces = await enumerateClaimSurfaces(root);
    const paths = surfaces.map((s) => s.path);

    expect(paths).toContain(join(root, "docs", "overview.md"));
    expect(paths).not.toContain(join(root, "docs", "research", "excluded.md"));
  });

  it("does NOT throw when optional files (PREFLIGHT.md) are absent", async () => {
    root = makeRoot();
    write(root, "README.md", "# README");
    // Do NOT write PREFLIGHT.md or scripts/bench/PREFLIGHT.md

    await expect(enumerateClaimSurfaces(root)).resolves.toBeTruthy();
  });

  it("does NOT throw when optional files (CHANGELOG.md) are absent", async () => {
    root = makeRoot();
    write(root, "README.md", "# README");

    await expect(enumerateClaimSurfaces(root)).resolves.toBeTruthy();
  });

  it("includes package.json when present", async () => {
    root = makeRoot();
    write(root, "README.md", "# README");
    write(root, "package.json", '{"name":"test"}');

    const surfaces = await enumerateClaimSurfaces(root);
    const paths = surfaces.map((s) => s.path);

    expect(paths).toContain(join(root, "package.json"));
  });

  it("includes CHANGELOG.md first 50 lines when present", async () => {
    root = makeRoot();
    write(root, "README.md", "# README");
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    write(root, "CHANGELOG.md", lines.join("\n"));

    const surfaces = await enumerateClaimSurfaces(root);
    const changelog = surfaces.find((s) => s.path === join(root, "CHANGELOG.md"));

    expect(changelog).toBeDefined();
    const changelogLines = changelog?.text.split("\n") ?? [];
    expect(changelogLines.length).toStrictEqual(50);
  });

  it("includes scripts/bench/README.md when present", async () => {
    root = makeRoot();
    write(root, "README.md", "# Root README");
    write(root, "scripts/bench/README.md", "# Bench README");

    const surfaces = await enumerateClaimSurfaces(root);
    const paths = surfaces.map((s) => s.path);

    expect(paths).toContain(join(root, "scripts", "bench", "README.md"));
  });
});
