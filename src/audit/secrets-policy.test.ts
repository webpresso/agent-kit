import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { auditSecretsPolicy } from "./secrets-policy.js";

const tempDirs: string[] = [];
const FAST_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_KEY_0: "core.fsync",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_VALUE_0: "none",
};

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", [...args], { cwd, env: FAST_GIT_ENV, stdio: "ignore" });
}

function tempRepo(withGit = false): string {
  const root = mkdtempSync(join(tmpdir(), "wp-secrets-policy-"));
  tempDirs.push(root);
  mkdirSync(join(root, ".webpresso"), { recursive: true });
  writeFileSync(
    join(root, ".webpresso", "secrets.config.json"),
    JSON.stringify({
      schemaVersion: 1,
      providers: { default: { type: "doppler", project: "my-project" } },
      profiles: { preview: { provider: "default", environment: "stg" } },
      sinks: { "dev-server": { defaultProfile: "preview", allowedOps: ["run"] } },
    }),
  );
  if (withGit) {
    git(root, ["init", "-q"]);
  }
  return root;
}

describe("auditSecretsPolicy", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips when secrets.config.json is absent (gate)", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-secrets-policy-gate-"));
    tempDirs.push(root);

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.violations).toStrictEqual([]);
  });

  test("flags forbidden secret file on disk (working tree)", () => {
    const root = tempRepo();
    writeFileSync(join(root, ".dev.vars"), "API_KEY=abc123");

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: ".dev.vars",
        message: expect.stringContaining("forbidden secret carrier"),
      }),
    ]);
  });

  test("resolves repo root from nested cwd before scanning", () => {
    const root = tempRepo();
    const nested = join(root, "apps", "web");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, ".dev.vars"), "API_KEY=abc123");

    const result = auditSecretsPolicy(nested);

    expect(result.ok).toBe(false);
    expect(result.checked).toBeGreaterThan(0);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: ".dev.vars",
        message: expect.stringContaining("forbidden secret carrier"),
      }),
    ]);
  });

  test("flags *.key file on disk", () => {
    const root = tempRepo();
    writeFileSync(join(root, "deploy.key"), "-----BEGIN RSA PRIVATE KEY-----");

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "deploy.key",
        message: expect.stringContaining("forbidden secret carrier"),
      }),
    ]);
  });

  test("flags service-account*.json file on disk", () => {
    const root = tempRepo();
    writeFileSync(join(root, "google-service-account.json"), '{"type":"service_account"}');

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: "google-service-account.json",
        message: expect.stringContaining("forbidden secret carrier"),
      }),
    ]);
  });

  test("handles non-git repo gracefully (no git dir)", () => {
    const root = tempRepo(false);

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(true);
  });

  // These tests exercise the real git index via `git add` + `git ls-files`.
  // On this runner they stay well under 10s in isolation but can exceed the
  // default budget under full-suite process contention, so keep the timeout
  // scoped to the git-backed cases only.
  test("flags tracked forbidden path in git", { timeout: 30000 }, () => {
    const root = tempRepo(true);
    writeFileSync(join(root, ".env"), "API_KEY=value");
    git(root, ["add", ".env"]);

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("tracked forbidden secret carrier"),
        }),
      ]),
    );
  });

  test("flags tracked file with secret-like value pattern", { timeout: 30000 }, () => {
    const root = tempRepo(true);
    const secretContent = "token: ghp_aAbBcCdDeEfFgGhH123456789012";
    writeFileSync(join(root, "config.json"), JSON.stringify({ info: secretContent }));
    git(root, ["add", "config.json"]);

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({ message: expect.stringContaining("secret-like value pattern") }),
    ]);
  });

  test("does not flag test file containing fake secret-like fixtures", { timeout: 30000 }, () => {
    const root = tempRepo(true);
    // Langfuse-style test fixture keys — real format, intentionally fake values
    const testContent =
      'const env = { LANGFUSE_PUBLIC_KEY: "pk-lf-test", LANGFUSE_SECRET_KEY: "sk-lf-test" }';
    writeFileSync(join(root, "service.test.ts"), testContent);
    git(root, ["add", "service.test.ts"]);

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([]);
  });

  test("does not flag e2e file containing GraphQL pk field names", { timeout: 30000 }, () => {
    const root = tempRepo(true);
    const e2eContent =
      'query { projects_by_pk(id: "00000000-0000-0000-0000-000000000000") { id } }';
    writeFileSync(join(root, "flow.e2e.ts"), e2eContent);
    git(root, ["add", "flow.e2e.ts"]);

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([]);
  });

  test("passes for clean git repo", { timeout: 30000 }, () => {
    const root = tempRepo(true);
    writeFileSync(join(root, "readme.md"), "# My project");
    git(root, ["add", "readme.md"]);

    const result = auditSecretsPolicy(root);

    expect(result.ok).toBe(true);
    expect(result.violations).toStrictEqual([]);
  });
});
