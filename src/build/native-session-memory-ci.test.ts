import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function nativeScopeFor(...paths: string[]): string {
  return execFileSync("bash", ["scripts/ci/change-scope.sh", "classify-native", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function workflowSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`  ${jobName}:`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = workflow.slice(start + 1);
  const next = /\n  [a-z0-9-]+:\n/u.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function expectNativeCiGate(workflow: string): void {
  expect(workflow).toContain("native-session-memory:");
  expect(workflow).toContain("name: Native session-memory");
  expect(workflow).toMatch(
    /name: Install Rust toolchain for native session-memory checks\n\s+run: rustup toolchain install 1\.88\.0 --profile minimal --component rustfmt,clippy/u,
  );
  expect(workflow).toContain("Swatinem/rust-cache@e18b497796c12c097a38f9edb9d0641fb99eee32");
  expect(workflow).toContain("taiki-e/install-action@16b05812d776ae1dfaabc8277e421fb6d2506419");
  expect(workflow).toContain("tool: cargo-deny@0.19.9");
  expect(workflow).toContain("pnpm run native:session-memory:fmt");
  expect(workflow).toContain("pnpm run native:session-memory:clippy");
  expect(workflow).not.toContain("cargo install cargo-deny --version 0.19.9 --locked");
  expect(workflow).toContain("pnpm run native:session-memory:deny");
  expect(workflow).toContain("pnpm run native:session-memory:test");
  expect(workflow).toContain("pnpm run native:session-memory:bench:run");
  expect(workflow).toContain("pnpm run native:session-memory:bench:gate");
  expect(workflow).toContain('WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE: "1"');
}

describe("native session-memory CI warmup", () => {
  it("wires native benchmark compile/run/gate scripts", () => {
    const pkg = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["native:session-memory:bench"]).toContain(
      "native:session-memory:bench:compile",
    );
    expect(pkg.scripts?.["native:session-memory:bench:compile"]).toContain("--no-run");
    expect(pkg.scripts?.["native:session-memory:bench:run"]).toContain("cargo bench");
    expect(pkg.scripts?.["native:session-memory:bench:run"]).not.toContain("--no-run");
    expect(pkg.scripts?.["native:session-memory:bench:gate"]).toContain(
      "check-bench-thresholds.sh",
    );
    expect(pkg.scripts?.["native:session-memory:deny"]).toBe(
      "cargo deny --manifest-path native/session-memory-engine/Cargo.toml check",
    );
  });

  it("warms the native addon before the public CI parallel test suite", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github", "workflows", "ci.agent-kit.yml"),
      "utf8",
    );

    expect(workflow).toContain("Warm native session-memory addon");
    expect(workflow.indexOf("Warm native session-memory addon")).toBeLessThan(
      workflow.indexOf("run: pnpm run test"),
    );
    expect(workflow).toContain("loadNativeSessionMemoryEngine");
    expectNativeCiGate(workflow);
    expect(workflow).toMatch(/wp-check:[\s\S]*native-session-memory/u);
    expect(workflow).toMatch(/wp-check:[\s\S]*ci-change-scope/u);
  });

  it("warms the native addon before the agent-kit self parallel test suite", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github", "workflows", "ci.agent-kit.yml"),
      "utf8",
    );

    expect(workflow).toContain("Warm native session-memory addon");
    expect(workflow.indexOf("Warm native session-memory addon")).toBeLessThan(
      workflow.indexOf("run: pnpm run test"),
    );
    expect(workflow).toContain("loadNativeSessionMemoryEngine");
    expectNativeCiGate(workflow);
  });
});

describe("native session-memory CI change-scope gating", () => {
  it("adds a fail-closed change-scope job before the native job", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github", "workflows", "ci.agent-kit.yml"),
      "utf8",
    );
    const changeScope = workflowSection(workflow, "ci-change-scope");
    const nativeJob = workflowSection(workflow, "native-session-memory");
    const e2eJob = workflowSection(workflow, "e2e");
    const wpCheck = workflowSection(workflow, "wp-check");

    expect(changeScope).toContain("name: CI change scope");
    expect(changeScope).toContain("needs: auth-preflight");
    expect(changeScope).toContain("actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0");
    expect(changeScope).toContain("fetch-depth: 0");
    expect(changeScope).toContain("native_session_memory_changed:");
    expect(changeScope).toContain("playwright_e2e_present:");
    expect(changeScope).toContain("scripts/ci/change-scope.sh");

    expect(nativeJob).toContain("needs: [auth-preflight, ci-change-scope]");
    expect(nativeJob).toContain("github.event_name != 'pull_request'");
    expect(nativeJob).toContain(
      "needs.ci-change-scope.outputs.native_session_memory_changed == 'true'",
    );

    expect(e2eJob).toContain("needs: [auth-preflight, ci-change-scope]");
    expect(e2eJob).toContain("needs.ci-change-scope.outputs.playwright_e2e_present == 'true'");

    expect(wpCheck).toContain("ci-change-scope,");
    expect(wpCheck).toContain("native-session-memory,");
    expect(wpCheck).toContain("contains(needs.*.result, 'failure')");
    expect(wpCheck).toContain("contains(needs.*.result, 'cancelled')");
    expect(wpCheck).not.toContain("contains(needs.*.result, 'skipped')");
  });

  it("classifies docs, blueprints, markdown, and ordinary non-Rust changes as safe to skip", () => {
    expect(nativeScopeFor("docs/bench/session-memory-methodology.md")).toBe("false");
    expect(nativeScopeFor("blueprints/draft/example.md", "README.md")).toBe("false");
    expect(nativeScopeFor(".changeset/native-docs.md")).toBe("false");
    expect(nativeScopeFor("src/cli/cli.ts")).toBe("false");
    expect(nativeScopeFor("package.contract.integration.test.ts")).toBe("false");
    expect(nativeScopeFor("scripts/bench/lib/result-card.ts")).toBe("false");
    expect(nativeScopeFor("packages/agent-core/src/index.ts")).toBe("false");
    expect(nativeScopeFor("src/session-memory/native-runtime.ts")).toBe("false");
    expect(nativeScopeFor("blueprints/draft/native-fixture/package.json")).toBe("false");
  });

  it("classifies native-impact paths as requiring native checks", () => {
    expect(nativeScopeFor("native/session-memory-engine/Cargo.toml")).toBe("true");
    expect(
      nativeScopeFor("native/session-memory-engine/crates/session-memory-core/src/lib.rs"),
    ).toBe("true");
    expect(nativeScopeFor("some/new/native_extension.rs")).toBe("true");
    expect(nativeScopeFor("scripts/build-session-memory-native-artifacts.ts")).toBe("true");
    expect(nativeScopeFor("scripts/stage-session-memory-native-artifacts.ts")).toBe("true");
    expect(nativeScopeFor("scripts/build-runtime-binaries.ts")).toBe("true");
    expect(nativeScopeFor("scripts/stage-plugin-runtime-artifacts.ts")).toBe("true");
    expect(nativeScopeFor("package.json")).toBe("true");
    expect(nativeScopeFor("pnpm-lock.yaml")).toBe("true");
    expect(nativeScopeFor("pnpm-workspace.yaml")).toBe("true");
    expect(nativeScopeFor(".github/workflows/ci.agent-kit.yml")).toBe("true");
    expect(nativeScopeFor("scripts/ci/change-scope.sh")).toBe("true");
    expect(nativeScopeFor("src/build/native-session-memory-ci.test.ts")).toBe("true");
  });

  it("preserves renamed native paths so native-to-non-native moves fail closed", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-native-scope-rename-test-"));
    const scriptPath = join(repositoryRoot, "scripts", "ci", "change-scope.sh");
    const outputPath = join(root, "github-output");
    try {
      execFileSync("git", ["init"], { cwd: root, encoding: "utf8" });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
      execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });

      const nativeDir = join(root, "native", "session-memory-engine", "crates", "core", "src");
      mkdirSync(nativeDir, { recursive: true });
      writeFileSync(join(nativeDir, "lib.rs"), "pub fn old_native() {}\n");
      execFileSync("git", ["add", "."], { cwd: root });
      execFileSync("git", ["commit", "-m", "add native file"], { cwd: root, encoding: "utf8" });
      const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();

      const docsDir = join(root, "docs");
      mkdirSync(docsDir, { recursive: true });
      renameSync(join(nativeDir, "lib.rs"), join(docsDir, "lib.rs.md"));
      execFileSync("git", ["add", "-A"], { cwd: root });
      execFileSync("git", ["commit", "-m", "move native file to docs"], {
        cwd: root,
        encoding: "utf8",
      });
      const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();

      execFileSync("bash", [scriptPath], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          BASE_SHA: baseSha,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_OUTPUT: outputPath,
          HEAD_SHA: headSha,
        },
      });

      const output = readFileSync(outputPath, "utf8");
      const nativeScopeOutputs = output
        .split("\n")
        .filter((line) => line.startsWith("native_session_memory_changed="));
      expect(nativeScopeOutputs[nativeScopeOutputs.length - 1]).toBe(
        "native_session_memory_changed=true",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails closed on an empty or unreadable file list", () => {
    expect(nativeScopeFor()).toBe("true");
  });

  it("emits a fail-closed native scope for non-PR events", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-native-scope-test-"));
    const outputPath = join(root, "github-output");
    try {
      execFileSync("bash", ["scripts/ci/change-scope.sh"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          GITHUB_OUTPUT: outputPath,
        },
      });

      const output = readFileSync(outputPath, "utf8");
      const nativeScopeOutputs = output
        .split("\n")
        .filter((line) => line.startsWith("native_session_memory_changed="));
      expect(nativeScopeOutputs[nativeScopeOutputs.length - 1]).toBe(
        "native_session_memory_changed=true",
      );
      expect(output).toContain("playwright_e2e_present=false");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
