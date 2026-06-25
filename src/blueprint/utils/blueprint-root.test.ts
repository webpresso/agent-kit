import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveBlueprintRoot } from "./blueprint-root.js";
import { resolveTechDebtRoot } from "./tech-debt-root.js";

describe("consumer layout root resolution", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function tempRoot(prefix: string): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), prefix));
    tempDirs.push(root);
    return root;
  }

  it("defaults fresh generic webpresso repos to top-level blueprints and tech-debt", async () => {
    const root = await tempRoot("wp-generic-root-");
    writeFileSync(path.join(root, "package.json"), '{"name":"consumer"}');

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, "blueprints"));
    expect(resolveTechDebtRoot(root)).toBe(path.join(root, "tech-debt"));
  });

  it("keeps Webpresso fallback when the legacy sentinel is present", async () => {
    const root = await tempRoot("wp-webpresso-root-");
    mkdirSync(path.join(root, "webpresso"), { recursive: true });
    writeFileSync(path.join(root, "webpresso", "config.yaml"), "project:\n  name: webpresso\n");
    writeFileSync(path.join(root, "package.json"), '{"name":"webpresso"}');

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, "webpresso", "blueprints"));
    expect(resolveTechDebtRoot(root)).toBe(path.join(root, "webpresso", "tech-debt"));
  });

  it("prefers existing generic directories over legacy directories in consumer repos", async () => {
    const root = await tempRoot("wp-existing-generic-root-");
    mkdirSync(path.join(root, "blueprints"), { recursive: true });
    mkdirSync(path.join(root, "webpresso", "blueprints"), { recursive: true });
    mkdirSync(path.join(root, "tech-debt"), { recursive: true });
    mkdirSync(path.join(root, "webpresso", "tech-debt"), { recursive: true });

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, "blueprints"));
    expect(resolveTechDebtRoot(root)).toBe(path.join(root, "tech-debt"));
  });

  it("prefers Webpresso directories when both layouts exist in a Webpresso repo", async () => {
    const root = await tempRoot("wp-webpresso-both-root-");
    mkdirSync(path.join(root, "blueprints"), { recursive: true });
    mkdirSync(path.join(root, "webpresso", "blueprints"), { recursive: true });
    mkdirSync(path.join(root, "tech-debt"), { recursive: true });
    mkdirSync(path.join(root, "webpresso", "tech-debt"), { recursive: true });
    writeFileSync(path.join(root, "webpresso", "config.yaml"), "project:\n  name: webpresso\n");
    writeFileSync(path.join(root, "package.json"), '{"name":"webpresso"}');

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, "webpresso", "blueprints"));
    expect(resolveTechDebtRoot(root)).toBe(path.join(root, "webpresso", "tech-debt"));
  });

  it("uses blueprintsDir from .webpressorc.json as highest-priority override", async () => {
    const root = await tempRoot("wp-config-override-");
    writeFileSync(path.join(root, "package.json"), '{"name":"consumer"}');
    writeFileSync(path.join(root, ".webpressorc.json"), JSON.stringify({ blueprintsDir: "plans" }));

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, "plans"));
  });

  it("config override takes priority over an existing webpresso/blueprints directory", async () => {
    const root = await tempRoot("wp-config-override-webpresso-");
    mkdirSync(path.join(root, "webpresso", "blueprints"), { recursive: true });
    writeFileSync(path.join(root, "webpresso", "config.yaml"), "project:\n  name: webpresso\n");
    writeFileSync(path.join(root, "package.json"), '{"name":"webpresso"}');
    writeFileSync(
      path.join(root, ".webpressorc.json"),
      JSON.stringify({ blueprintsDir: "webpresso/blueprints" }),
    );

    expect(resolveBlueprintRoot(root)).toBe(path.join(root, "webpresso", "blueprints"));
  });
});
