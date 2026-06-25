import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WEBPRESSO_CONFIG_FILE_NAME } from "./config.js";
import {
  WebpressoConfigExportError,
  HostAdapterExportError,
  findWebpressoConfigPath,
  getWebpressoConfigPath,
  loadWebpressoConfigSafe,
  loadHostAdapter,
} from "./load-host-adapter.js";

describe("load-host-adapter", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `webpresso-e2e-loader-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns null when the root config file does not exist", async () => {
    expect(findWebpressoConfigPath(testDir)).toBeNull();
    expect(getWebpressoConfigPath(testDir)).toBe(join(testDir, WEBPRESSO_CONFIG_FILE_NAME));
    await expect(loadWebpressoConfigSafe({ cwd: testDir })).resolves.toBeNull();
    await expect(loadHostAdapter({ cwd: testDir })).resolves.toBeNull();
  });

  it("walks upward to find webpresso.config.ts from nested package directories", async () => {
    const nestedDir = join(testDir, "apps", "e2e");
    mkdirSync(nestedDir, { recursive: true });

    writeFileSync(
      join(testDir, WEBPRESSO_CONFIG_FILE_NAME),
      [
        "export const webpressoConfig = {",
        "  e2e: { hostAdapterModule: './adapter.ts' },",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(testDir, "adapter.ts"),
      [
        "export const webpressoE2eHostAdapter = {",
        "  listSuites: () => [{ id: 'nested', fileMatchers: ['tests/'], batchKey: 'nested', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'nested' ? 'nested' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'nested' }),",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(findWebpressoConfigPath(nestedDir)).toBe(join(testDir, WEBPRESSO_CONFIG_FILE_NAME));
    const loadedAdapter = await loadHostAdapter({ cwd: nestedDir });
    expect(loadedAdapter?.configPath).toBe(join(testDir, WEBPRESSO_CONFIG_FILE_NAME));
    expect(loadedAdapter?.exportName).toBe("webpressoE2eHostAdapter");
  });

  it("walks upward to find agent-kit.config.ts and loads agentKitConfig", async () => {
    const nestedDir = join(testDir, "apps", "e2e");
    mkdirSync(nestedDir, { recursive: true });

    writeFileSync(
      join(testDir, "agent-kit.config.ts"),
      [
        "export const agentKitConfig = {",
        "  e2e: { hostAdapterModule: './adapter.ts' },",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(testDir, "adapter.ts"),
      [
        "export const webpressoE2eHostAdapter = {",
        "  listSuites: () => [{ id: 'agent-kit', fileMatchers: ['tests/'], batchKey: 'agent-kit', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'agent-kit' ? 'agent-kit' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'agent-kit' }),",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(findWebpressoConfigPath(nestedDir)).toBe(join(testDir, "agent-kit.config.ts"));
    const loadedAdapter = await loadHostAdapter({ cwd: nestedDir });
    expect(loadedAdapter?.configPath).toBe(join(testDir, "agent-kit.config.ts"));
    expect(loadedAdapter?.adapter.resolveSuiteId("agent-kit")).toBe("agent-kit");
  });

  it("prefers agent-kit.config.ts when a legacy webpresso.config.ts bridge also exists", async () => {
    writeFileSync(
      join(testDir, WEBPRESSO_CONFIG_FILE_NAME),
      [
        "import { agentKitConfig } from './agent-kit.config.ts'",
        "export const webpressoConfig = agentKitConfig",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(testDir, "agent-kit.config.ts"),
      [
        "export const agentKitConfig = {",
        "  e2e: { hostAdapterModule: './adapter.ts' },",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(testDir, "adapter.ts"),
      [
        "export const webpressoE2eHostAdapter = {",
        "  listSuites: () => [{ id: 'canonical', fileMatchers: ['tests/'], batchKey: 'canonical', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'canonical' ? 'canonical' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'canonical' }),",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(findWebpressoConfigPath(testDir)).toBe(join(testDir, "agent-kit.config.ts"));
    await expect(loadHostAdapter({ cwd: testDir })).resolves.toMatchObject({
      configPath: join(testDir, "agent-kit.config.ts"),
    });
  });

  it("fails when the root config file does not export webpressoConfig", async () => {
    writeFileSync(
      join(testDir, WEBPRESSO_CONFIG_FILE_NAME),
      "export const wrongName = {}\n",
      "utf8",
    );

    await expect(loadHostAdapter({ cwd: testDir })).rejects.toBeInstanceOf(
      WebpressoConfigExportError,
    );
  });

  it("fails when the configured adapter export cannot be found", async () => {
    writeFileSync(
      join(testDir, WEBPRESSO_CONFIG_FILE_NAME),
      [
        "export const webpressoConfig = {",
        "  e2e: { hostAdapterModule: './adapter.ts' },",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(join(testDir, "adapter.ts"), "export const somethingElse = {}\n", "utf8");

    await expect(loadHostAdapter({ cwd: testDir })).rejects.toBeInstanceOf(HostAdapterExportError);
  });

  it("loads the explicit host adapter export before fallback names", async () => {
    writeFileSync(
      join(testDir, WEBPRESSO_CONFIG_FILE_NAME),
      [
        "export const webpressoConfig = {",
        "  e2e: { hostAdapterModule: './adapter.ts', hostAdapterExport: 'customAdapter' },",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(testDir, "adapter.ts"),
      [
        "export const customAdapter = {",
        "  listSuites: () => [{ id: 'custom', fileMatchers: ['tests/'], batchKey: 'custom', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'custom' ? 'custom' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'custom' }),",
        "}",
        "",
        "export const webpressoE2eHostAdapter = {",
        "  listSuites: () => [{ id: 'fallback', fileMatchers: ['fallback/'], batchKey: 'fallback', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'fallback' ? 'fallback' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'fallback' }),",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const loadedAdapter = await loadHostAdapter({ cwd: testDir });

    expect(loadedAdapter?.exportName).toBe("customAdapter");
    expect(loadedAdapter?.adapter.resolveSuiteId("custom")).toBe("custom");
    expect(loadedAdapter?.adapter.normalizeFilePath("tests/example.e2e.ts")).toBe(
      "tests/example.e2e.ts",
    );
    expect(loadedAdapter?.moduleSpecifier).toBe(pathToFileURL(join(testDir, "adapter.ts")).href);
  });

  it("falls back to generic, legacy webpresso, and default exports", async () => {
    const createCaseDir = (name: string) => {
      const caseDir = join(testDir, name);
      mkdirSync(caseDir, { recursive: true });
      return caseDir;
    };

    const writeConfig = (caseDir: string, moduleName: string) =>
      writeFileSync(
        join(caseDir, WEBPRESSO_CONFIG_FILE_NAME),
        [
          "export const webpressoConfig = {",
          `  e2e: { hostAdapterModule: './${moduleName}' },`,
          "}",
          "",
        ].join("\n"),
        "utf8",
      );

    const genericDir = createCaseDir("generic");
    writeConfig(genericDir, "adapter.ts");
    writeFileSync(
      join(genericDir, "adapter.ts"),
      [
        "export const webpressoE2eHostAdapter = {",
        "  listSuites: () => [{ id: 'generic', fileMatchers: ['tests/'], batchKey: 'generic', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'generic' ? 'generic' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'generic' }),",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await expect(loadHostAdapter({ cwd: genericDir })).resolves.toMatchObject({
      exportName: "webpressoE2eHostAdapter",
    });

    const legacyDir = createCaseDir("legacy");
    writeConfig(legacyDir, "adapter.ts");
    writeFileSync(
      join(legacyDir, "adapter.ts"),
      [
        "export const webpressoE2eHostAdapter = {",
        "  listSuites: () => [{ id: 'legacy', fileMatchers: ['tests/'], batchKey: 'legacy', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'legacy' ? 'legacy' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'legacy' }),",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await expect(loadHostAdapter({ cwd: legacyDir })).resolves.toMatchObject({
      exportName: "webpressoE2eHostAdapter",
    });

    const defaultDir = createCaseDir("default");
    writeConfig(defaultDir, "adapter.ts");
    writeFileSync(
      join(defaultDir, "adapter.ts"),
      [
        "const adapter = {",
        "  listSuites: () => [{ id: 'default-fallback', fileMatchers: ['tests/'], batchKey: 'fallback', steps: [] }],",
        "  resolveSuiteId: (name) => name === 'default-fallback' ? 'default-fallback' : null,",
        "  normalizeFilePath: (file) => file,",
        "  resolveSuiteForFile: (file) => ({ normalizedPath: file, suiteId: 'default-fallback' }),",
        "}",
        "",
        "export default adapter",
        "",
      ].join("\n"),
      "utf8",
    );

    const loadedAdapter = await loadHostAdapter({ cwd: defaultDir });
    expect(loadedAdapter?.exportName).toBe("default");
    expect(loadedAdapter?.adapter.resolveSuiteId("default-fallback")).toBe("default-fallback");
  });
});
