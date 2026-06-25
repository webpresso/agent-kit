import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { auditGithubActionsSecrets } from "#audit/github-actions-secrets";
import { auditPackageSurface } from "#audit/package-surface";
import { auditSecretProviderQuarantine } from "#audit/secret-provider-quarantine";

const tempDirs: string[] = [];

function fixtureRoot(name: string): string {
  return resolve(import.meta.dirname, "fixtures", name);
}

function copyFixture(name: string): string {
  const destination = mkdtempSync(join(tmpdir(), `wp-migrate-${name}-`));
  tempDirs.push(destination);
  cpSync(fixtureRoot(name), destination, { recursive: true });
  return destination;
}

describe("secret migration fixtures", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("legacy local scripts fixture fails all hard-cut audits", () => {
    const root = copyFixture("legacy-local-scripts");

    expect(auditSecretProviderQuarantine(root).ok).toBe(false);
    expect(auditGithubActionsSecrets(root).ok).toBe(false);
    expect(auditPackageSurface(root).ok).toBe(false);
  });

  test("clean global-wp fixture passes all hard-cut audits", () => {
    const root = copyFixture("clean-global-wp");

    expect(auditSecretProviderQuarantine(root).ok).toBe(true);
    expect(auditGithubActionsSecrets(root).ok).toBe(true);
    expect(auditPackageSurface(root).ok).toBe(true);
  });
});
