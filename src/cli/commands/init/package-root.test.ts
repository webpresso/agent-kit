import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { isAgentKitPackageRoot, resolveAgentKitPackageRoot } from "./package-root.js";

const JS_SELECTOR_BIN_WP =
  "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n";

type RuntimePayloadFixture = {
  readonly agentKitDir: string;
  readonly runtimePayloadDir: string;
  readonly runtimePayloadBinWp: string;
};

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Mirrors the real on-disk layout of a compiled `wp` install: the published
 * `@webpresso/agent-kit` package carries the JS-selector `bin/wp` plus
 * `.claude-plugin/plugin.json`, and depends on a native runtime-payload
 * sub-package `@webpresso/agent-kit-runtime-<os>-<cpu>` that ships only a
 * native `bin/wp` (no plugin manifest).
 */
function buildRuntimePayloadFixture(root: string): RuntimePayloadFixture {
  const agentKitDir = join(root, "node_modules", "@webpresso", "agent-kit");
  mkdirSync(join(agentKitDir, "bin"), { recursive: true });
  mkdirSync(join(agentKitDir, ".claude-plugin"), { recursive: true });
  mkdirSync(join(agentKitDir, "catalog"), { recursive: true });
  writeJson(join(agentKitDir, "package.json"), { name: "@webpresso/agent-kit" });
  writeFileSync(join(agentKitDir, "bin", "wp"), JS_SELECTOR_BIN_WP);
  writeJson(join(agentKitDir, ".claude-plugin", "plugin.json"), { version: "0.0.0" });

  const runtimePayloadDir = join(
    agentKitDir,
    "node_modules",
    "@webpresso",
    "agent-kit-runtime-darwin-arm64",
  );
  mkdirSync(join(runtimePayloadDir, "bin"), { recursive: true });
  writeJson(join(runtimePayloadDir, "package.json"), {
    name: "@webpresso/agent-kit-runtime-darwin-arm64",
  });
  // Stand-in for the Mach-O payload; only its existence matters to the resolver.
  writeFileSync(join(runtimePayloadDir, "bin", "wp"), "ELF-or-mach-o-binary-payload");

  return {
    agentKitDir,
    runtimePayloadDir,
    runtimePayloadBinWp: join(runtimePayloadDir, "bin", "wp"),
  };
}

describe("resolveAgentKitPackageRoot with a nested runtime-payload package", () => {
  const cleanup = new Set<string>();

  afterEach(() => {
    for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
    cleanup.clear();
  });

  function fixture(): RuntimePayloadFixture {
    const root = mkdtempSync(join(tmpdir(), "agent-kit-package-root-"));
    cleanup.add(root);
    return buildRuntimePayloadFixture(root);
  }

  it("walks past the runtime-payload package to the real agent-kit package root", () => {
    const { agentKitDir, runtimePayloadBinWp } = fixture();

    const resolved = resolveAgentKitPackageRoot({
      moduleUrl: pathToFileURL(runtimePayloadBinWp).href,
      argv0: "",
      argv1: "",
      execPath: join(tmpdir(), "no-agent-kit-ancestor", "node"),
      pathEnv: "",
      platform: "darwin",
    });

    expect(resolved).toBe(agentKitDir);
  });

  it("does not treat a runtime-payload package directory as an agent-kit root", () => {
    const { runtimePayloadDir } = fixture();

    expect(isAgentKitPackageRoot(runtimePayloadDir)).toBe(false);
  });
});
