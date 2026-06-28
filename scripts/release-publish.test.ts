import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readReleasePublishSource(): string {
  return readFileSync(join(import.meta.dirname, "release-publish.ts"), "utf8").replaceAll('"', "'");
}

describe("release-publish runtime lane", () => {
  it("builds, stages, and publishes platform runtime packages before the root package", () => {
    const source = readReleasePublishSource();
    const rootPublishIndex = source.lastIndexOf("'publish'");

    expect(source.indexOf("['run', 'build']")).toBeLessThan(
      source.indexOf("['run', 'build:runtime-binaries']"),
    );
    expect(source.indexOf("['run', 'build:runtime-binaries']")).toBeLessThan(
      source.indexOf("['run', 'stage:plugin-runtime']"),
    );
    expect(source).toContain("for (const target of RUNTIME_TARGETS)");
    expect(source).toContain("resolve(runtimePackageRoot, runtimePackage)");
    expect(rootPublishIndex).toBeGreaterThan(
      source.indexOf("for (const target of RUNTIME_TARGETS)"),
    );
  });

  it("explicitly prepares and restores the packed root manifest around root publish", () => {
    const source = readReleasePublishSource();
    const rootPublishIndex = source.lastIndexOf("'publish'");

    expect(source).toContain("preparePackedManifest(packageRoot)");
    expect(source).toContain("restorePackedManifest(packageRoot)");
    expect(source.indexOf("preparePackedManifest(packageRoot)")).toBeLessThan(rootPublishIndex);
    expect(source.indexOf("restorePackedManifest(packageRoot)")).toBeGreaterThan(rootPublishIndex);
    expect(source).toContain("'--ignore-scripts'");
  });

  it("writes an explicit publish-result handoff file after successful root publish", () => {
    const source = readReleasePublishSource();

    expect(source).toContain(
      "const RELEASE_PUBLISH_RESULT_FILE_ENV = 'RELEASE_PUBLISH_RESULT_FILE'",
    );
    expect(source).toContain("interface PublishedPackage");
    expect(source).toContain("category: ReleasePackageCategory");
    expect(source).toContain("category: classifyReleasePackage(pkg.name)");
    expect(source).toContain(
      "function writePublishResultFile(packages: readonly PublishedPackage[])",
    );
    expect(source).toContain("publishState: primaryPackage.publishState");
    expect(source).toContain("packages,");
    expect(source).toContain(
      "publishedPackages.push(toPublishedPackage(rootPackage, rootPublishState))",
    );
    expect(source).toContain("writePublishResultFile(publishedPackages)");
    expect(source).toContain("rootPublishState = 'published'");
    expect(source).toContain("rootPublishState = 'already-published'");
  });

  it("publishes non-root public workspace packages before the special root package flow", () => {
    const source = readReleasePublishSource();

    expect(source).toContain("function discoverWorkspacePackages");
    expect(source).toContain("workspaceDependencyNames(manifest)");
    expect(source).toContain("orderWorkspacePackagesForRelease(packages)");
    expect(source).toContain("function publishSimpleWorkspacePackage");
    expect(source).toContain(
      "for (const workspacePackage of discoverWorkspacePackages(packageRoot))",
    );
    expect(source).toContain("preparePackedManifest(pkg.root, {");
    expect(source).toContain("includeRuntimeOptionalDependencies: false");
    expect(source).toContain("restorePackedManifest(pkg.root)");
    expect(source).toContain("'--ignore-scripts'");
    expect(source.indexOf("publishSimpleWorkspacePackage(workspacePackage)")).toBeLessThan(
      source.indexOf("const buildResult = run('pnpm', ['run', 'build'])"),
    );
  });

  it("fails before publish when a local package manifest is behind npm latest", () => {
    const source = readReleasePublishSource();

    expect(source).toContain("function assertNotBehindRegistry");
    expect(source).toContain("npmLatestVersion(pkg.name)");
    expect(source).toContain("is behind npm latest");
    expect(source).toContain("Sync the local package manifest to the published baseline");
  });

  it("skips root publish when the root package version is already published and unchanged", () => {
    const source = readReleasePublishSource();

    expect(source).toContain("manifestVersionChangedSinceFirstParent(rootPackage)");
    expect(source).toContain("already published and unchanged; skipping root publish");
    expect(source).toContain("writePublishResultFile(publishedPackages)");
  });

  it("keeps already-published changed workspace packages in the release handoff for finalization reruns", () => {
    const source = readReleasePublishSource();

    const workspacePublish = source.slice(
      source.indexOf("function publishSimpleWorkspacePackage"),
      source.indexOf("function toPublishedPackage"),
    );
    expect(workspacePublish).toContain("manifestVersionChangedSinceFirstParent(pkg)");
    expect(workspacePublish).toContain("return 'already-published'");
  });

  it("fails closed unless every declared session-memory native package is staged from the release handoff", () => {
    const source = readReleasePublishSource();

    expect(source).toContain(
      "const SESSION_MEMORY_NATIVE_ARTIFACTS_DIR_ENV = 'SESSION_MEMORY_NATIVE_ARTIFACTS_DIR'",
    );
    expect(source).toContain("function requireSessionMemoryNativeArtifactsDir()");
    expect(source).toContain("is required to publish the session-memory native matrix");
    expect(source).toContain("const sessionMemoryNativeStageArgs = [");
    expect(source).toContain("'--source-dir'");
    expect(source).toContain("function assertPreparedSessionMemoryNativePackages");
    expect(source).toContain("missing session-memory native package artifact");
    expect(source).toContain("missing session-memory native package manifest");
    expect(source).toContain("SESSION_MEMORY_NATIVE_TARGETS.map");
    expect(source).toContain("session-memory native package version mismatch");
    const nativePublishBlock = source.slice(
      source.indexOf("const sessionMemoryNativePackageRoot"),
      source.indexOf("} else {", source.indexOf("const sessionMemoryNativePackageRoot")),
    );
    expect(nativePublishBlock).not.toContain("'build:session-memory-native'");
    expect(nativePublishBlock).not.toContain("'--target',\n    'host'");
    expect(nativePublishBlock).not.toContain("existsSync(resolve(preparedPackageRoot");
  });

  it("rehydrates downloaded session-memory native artifacts after build and before staging", () => {
    const source = readReleasePublishSource();

    expect(source).toContain(
      "const SESSION_MEMORY_NATIVE_DOWNLOADS_DIR_ENV = 'SESSION_MEMORY_NATIVE_DOWNLOADS_DIR'",
    );
    expect(source).toContain("function rehydrateSessionMemoryNativeArtifacts(rootDir: string)");
    expect(source).toContain("[release:publish] rehydrated session-memory native artifact");
    expect(source.indexOf("rehydrateSessionMemoryNativeArtifacts(packageRoot)")).toBeLessThan(
      source.indexOf("const sessionMemoryNativeStageArgs = ["),
    );
  });
});
