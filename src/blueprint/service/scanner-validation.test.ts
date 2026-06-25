import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ScanOptions, scanBlueprintDirectory } from "./scanner.js";

describe("scanBlueprintDirectory - validation", () => {
  const testDir = `/tmp/test-blueprints-val-${Date.now()}`;

  beforeEach(() => {
    mkdirSync(`${testDir}/webpresso/blueprints/my-feature`, { recursive: true });
    mkdirSync(`${testDir}/webpresso/blueprints/completed/tooling`, { recursive: true });
    mkdirSync(`${testDir}/webpresso/blueprints/_future/idea`, { recursive: true });

    writeFileSync(`${testDir}/webpresso/blueprints/my-feature/_overview.md`, "# Plan");
    writeFileSync(
      `${testDir}/webpresso/blueprints/completed/tooling/_overview.md`,
      "# Tooling Plan",
    );
    writeFileSync(`${testDir}/webpresso/blueprints/_future/idea/_overview.md`, "# Future Idea");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("special folder exclusion vs inclusion", () => {
    it("should exclude _future plans when includeSpecialFolders is false", () => {
      const excludeResult = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      });

      const includeResult = scanBlueprintDirectory({
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      });

      expect(excludeResult.every((p) => p.isSpecialFolder === false)).toBe(true);
      expect(excludeResult.length).toBe(2);

      expect(includeResult.length).toBe(3);
      const futurePlan = includeResult.find((p) => p.isSpecialFolder === true);
      expect(futurePlan).toMatchObject({ specialFolderType: "_future" });
      expect(futurePlan!.specialFolderType).toBe("_future");
    });
  });

  describe("exact result validation", () => {
    it("should return exactly the expected plans for the test directory structure", () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      };

      const result = scanBlueprintDirectory(options);

      expect(result.length).toBe(2);

      const slugs = result.map((p) => p.slug).toSorted();
      expect(slugs).toEqual(["completed/tooling", "my-feature"]);

      const myFeature = result.find((p) => p.slug === "my-feature")!;
      expect(myFeature.group).toBeNull();
      expect(myFeature.isSpecialFolder).toBe(false);
      expect(myFeature.specialFolderType).toBe(undefined);
      expect(myFeature.path).toBe(`${testDir}/webpresso/blueprints/my-feature/_overview.md`);

      const tooling = result.find((p) => p.slug === "completed/tooling")!;
      expect(tooling.group).toBe("completed");
      expect(tooling.isSpecialFolder).toBe(false);
      expect(tooling.specialFolderType).toBe(undefined);
      expect(tooling.path).toBe(`${testDir}/webpresso/blueprints/completed/tooling/_overview.md`);
    });

    it("should return exactly the expected plans including special folders", () => {
      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      };

      const result = scanBlueprintDirectory(options);

      expect(result.length).toBe(3);

      const slugs = result.map((p) => p.slug).toSorted();
      expect(slugs).toEqual(["_future/idea", "completed/tooling", "my-feature"]);

      const futurePlan = result.find((p) => p.slug === "_future/idea")!;
      expect(futurePlan.isSpecialFolder).toBe(true);
      expect(futurePlan.specialFolderType).toBe("_future");
      expect(futurePlan.group).toBeNull();
      expect(futurePlan.path).toBe(`${testDir}/webpresso/blueprints/_future/idea/_overview.md`);
    });
  });

  describe("deeply nested structures", () => {
    it("should scan plans in deeply nested directories", () => {
      mkdirSync(`${testDir}/webpresso/blueprints/area/group/sub`, { recursive: true });
      writeFileSync(`${testDir}/webpresso/blueprints/area/group/sub/_overview.md`, "# Deep");

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: false,
      };

      const result = scanBlueprintDirectory(options);

      const deepPlan = result.find((p) => p.slug === "area/group/sub");
      expect(deepPlan).toMatchObject({ group: "area" });
      expect(deepPlan!.group).toBe("area");
      expect(deepPlan!.path).toBe(`${testDir}/webpresso/blueprints/area/group/sub/_overview.md`);
    });
  });

  describe("containsHiddenDirectory defense-in-depth", () => {
    it("should filter out _overview.md found in paths with hidden parent directories", () => {
      mkdirSync(`${testDir}/webpresso/blueprints/visible/.secret/plan`, { recursive: true });
      writeFileSync(
        `${testDir}/webpresso/blueprints/visible/.secret/plan/_overview.md`,
        "# Secret Plan",
      );

      const options: ScanOptions = {
        baseDir: `${testDir}/webpresso/blueprints`,
        includeSpecialFolders: true,
      };

      const result = scanBlueprintDirectory(options);

      const secretPlan = result.find((p) => p.path.includes(".secret"));
      expect(secretPlan).toBe(undefined);
    });
  });

  describe("empty blueprint directory", () => {
    it("should return empty array for an empty directory with no plans", () => {
      const emptyDir = `${testDir}/empty-blueprints`;
      mkdirSync(emptyDir, { recursive: true });

      const options: ScanOptions = {
        baseDir: emptyDir,
        includeSpecialFolders: true,
      };

      const result = scanBlueprintDirectory(options);

      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
  });

  describe("isMonorepoRoot mutations (lines 14-22)", () => {
    it("should resolve relative baseDir via monorepo root when package.json has workspaces", () => {
      const fakeMonorepo = `${testDir}/fake-monorepo`;
      mkdirSync(`${fakeMonorepo}/blueprints/plan-a`, { recursive: true });
      writeFileSync(
        `${fakeMonorepo}/package.json`,
        JSON.stringify({ name: "monorepo", workspaces: ["packages/*"] }),
      );
      writeFileSync(`${fakeMonorepo}/blueprints/plan-a/_overview.md`, "# Plan A");

      const result = scanBlueprintDirectory({
        baseDir: `${fakeMonorepo}/blueprints`,
      });

      expect(result.length).toBe(1);
      expect(result[0]!.slug).toBe("plan-a");
    });

    it("should handle package.json WITHOUT workspaces field (not a monorepo root)", () => {
      const noWorkspacesDir = `${testDir}/no-workspaces`;
      mkdirSync(`${noWorkspacesDir}/blueprints/plan-b`, { recursive: true });
      writeFileSync(
        `${noWorkspacesDir}/package.json`,
        JSON.stringify({ name: "not-monorepo", version: "1.0.0" }),
      );
      writeFileSync(`${noWorkspacesDir}/blueprints/plan-b/_overview.md`, "# Plan B");

      const result = scanBlueprintDirectory({
        baseDir: `${noWorkspacesDir}/blueprints`,
      });

      expect(result.length).toBe(1);
      expect(result[0]!.slug).toBe("plan-b");
    });

    it("should handle directory with no package.json at all", () => {
      const noPkgDir = `${testDir}/no-package`;
      mkdirSync(`${noPkgDir}/blueprints/plan-c`, { recursive: true });
      writeFileSync(`${noPkgDir}/blueprints/plan-c/_overview.md`, "# Plan C");

      const result = scanBlueprintDirectory({
        baseDir: `${noPkgDir}/blueprints`,
      });

      expect(result.length).toBe(1);
      expect(result[0]!.slug).toBe("plan-c");
    });

    it("should handle invalid/corrupt package.json gracefully", () => {
      const corruptDir = `${testDir}/corrupt-pkg`;
      mkdirSync(`${corruptDir}/blueprints/plan-d`, { recursive: true });
      writeFileSync(`${corruptDir}/package.json`, "{ this is not valid json !!!");
      writeFileSync(`${corruptDir}/blueprints/plan-d/_overview.md`, "# Plan D");

      const result = scanBlueprintDirectory({
        baseDir: `${corruptDir}/blueprints`,
      });

      expect(result.length).toBe(1);
      expect(result[0]!.slug).toBe("plan-d");
    });

    it("should distinguish workspaces: undefined vs workspaces defined", () => {
      const withWorkspaces = `${testDir}/with-ws`;
      const withoutWorkspaces = `${testDir}/without-ws`;

      mkdirSync(`${withWorkspaces}/blueprints/x`, { recursive: true });
      mkdirSync(`${withoutWorkspaces}/blueprints/y`, { recursive: true });

      writeFileSync(
        `${withWorkspaces}/package.json`,
        JSON.stringify({ workspaces: ["packages/*"] }),
      );
      writeFileSync(`${withoutWorkspaces}/package.json`, JSON.stringify({ name: "no-ws" }));

      writeFileSync(`${withWorkspaces}/blueprints/x/_overview.md`, "# X");
      writeFileSync(`${withoutWorkspaces}/blueprints/y/_overview.md`, "# Y");

      const resultWith = scanBlueprintDirectory({ baseDir: `${withWorkspaces}/blueprints` });
      const resultWithout = scanBlueprintDirectory({ baseDir: `${withoutWorkspaces}/blueprints` });

      expect(resultWith.length).toBe(1);
      expect(resultWithout.length).toBe(1);
    });
  });
});
