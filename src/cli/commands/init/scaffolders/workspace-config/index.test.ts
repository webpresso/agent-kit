import { load as yamlLoad } from "js-yaml";
import { describe, expect, it, vi } from "vitest";

import { scaffoldWorkspaceConfig } from "./index.js";

describe("scaffoldWorkspaceConfig", () => {
  it("creates the file when absent", async () => {
    const exists = vi.fn(() => false);
    const mkdir = vi.fn();
    const writeFile = vi.fn();

    const result = await scaffoldWorkspaceConfig({
      configPath: "/fake/home/.agent/workspace.yaml",
      exists,
      mkdir,
      writeFile,
    });

    expect(result).toEqual({ action: "created" });
    expect(mkdir).toHaveBeenCalledWith("/fake/home/.agent", { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      "/fake/home/.agent/workspace.yaml",
      expect.any(String),
      "utf8",
    );
  });

  it("is idempotent — returns existing without writing when file already present", async () => {
    const exists = vi.fn(() => true);
    const mkdir = vi.fn();
    const writeFile = vi.fn();

    const result = await scaffoldWorkspaceConfig({
      configPath: "/fake/home/.agent/workspace.yaml",
      exists,
      mkdir,
      writeFile,
    });

    expect(result).toEqual({ action: "existing" });
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("writes valid YAML content", async () => {
    let written = "";
    const exists = vi.fn(() => false);
    const mkdir = vi.fn();
    const writeFile = vi.fn((_p: string, content: string) => {
      written = content;
    });

    await scaffoldWorkspaceConfig({
      configPath: "/fake/home/.agent/workspace.yaml",
      exists,
      mkdir,
      writeFile,
    });

    expect(() => yamlLoad(written)).not.toThrow();
    const parsed = yamlLoad(written) as Record<string, unknown>;
    expect(parsed).toHaveProperty("repos");
    expect(Array.isArray(parsed.repos)).toBe(true);
  });
});
