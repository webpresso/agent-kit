/**
 * Generic launch-profile var-assembly tests.
 *
 * These exercise the real (un-mocked) var-assembly code path over a generic
 * {@link ProvisionedDatabaseHandle}. No `EphemeralBranch`, no app-slug
 * heuristics, no `cli-utils`-private helpers.
 */

import type { ProvisionedDatabaseHandle } from "./contracts";

import { describe, expect, it } from "vitest";

import { assembleEffectiveVars, type AssembleEffectiveVarsInput } from "./launch-profile";

function handle(overrides: Partial<ProvisionedDatabaseHandle> = {}): ProvisionedDatabaseHandle {
  return {
    id: "handle-1",
    primaryConnectionUri: "postgresql://primary/db",
    ...overrides,
  };
}

describe("launch-profile: assembleEffectiveVars", () => {
  it("returns a fresh object that passes provided vars through when no handle + no injector", () => {
    const vars = { MY_VAR: "value", ANOTHER: "data" };

    const input: AssembleEffectiveVarsInput = {
      vars,
    };
    const result = assembleEffectiveVars(input);

    expect(result.MY_VAR).toBe("value");
    expect(result.ANOTHER).toBe("data");
    // Must be a copy, not the same reference
    result.NEW = "new";
    expect(vars).not.toHaveProperty("NEW");
  });

  it("uses the provided runtime-url selector to build DATABASE_URL when a handle is supplied", () => {
    const input: AssembleEffectiveVarsInput = {
      vars: {},
      databaseHandle: handle({
        primaryConnectionUri: "postgresql://primary/db",
        applicationConnectionUri: "postgresql://app/db",
        runtimeConnectionUri: "postgresql://runtime/db",
      }),
      databaseUrlSelector: (h) => ({
        runtimeDatabaseUrl: h.runtimeConnectionUri ?? h.primaryConnectionUri,
      }),
    };

    const result = assembleEffectiveVars(input);

    expect(result.DATABASE_URL).toBe("postgresql://runtime/db");
    expect(result.HASURA_GRAPHQL_METADATA_DATABASE_URL).toBe(undefined);
  });

  it("adds an optional metadata-database var when the selector returns one", () => {
    const input: AssembleEffectiveVarsInput = {
      vars: {},
      databaseHandle: handle({
        applicationConnectionUri: "postgresql://app/db",
      }),
      databaseUrlSelector: (h) => ({
        runtimeDatabaseUrl: h.applicationConnectionUri ?? h.primaryConnectionUri,
        metadataDatabaseUrl: h.applicationConnectionUri ?? h.primaryConnectionUri,
      }),
    };

    const result = assembleEffectiveVars(input);

    expect(result.DATABASE_URL).toBe("postgresql://app/db");
    expect(result.HASURA_GRAPHQL_METADATA_DATABASE_URL).toBe("postgresql://app/db");
  });

  it("invokes the secret injector after vars are copied but before DB vars are assigned", () => {
    const callOrder: string[] = [];

    const input: AssembleEffectiveVarsInput = {
      vars: { EXISTING: "keep-me" },
      databaseHandle: handle(),
      databaseUrlSelector: (h) => {
        callOrder.push("selector");
        return { runtimeDatabaseUrl: h.primaryConnectionUri };
      },
      secretInjector: (target) => {
        callOrder.push("injector");
        expect(target.EXISTING).toBe("keep-me");
        target.GRAPHQL_ADMIN_SECRET = "injected-secret";
      },
    };

    const result = assembleEffectiveVars(input);

    expect(callOrder).toEqual(["injector", "selector"]);
    expect(result.GRAPHQL_ADMIN_SECRET).toBe("injected-secret");
    expect(result.DATABASE_URL).toBe("postgresql://primary/db");
  });

  it("propagates throws from the secret injector without mutating caller vars", () => {
    const vars = { EXISTING: "keep-me" };

    expect(() =>
      assembleEffectiveVars({
        vars,
        secretInjector: () => {
          throw new Error("Missing required runtime secrets: BETTER_AUTH_SECRET");
        },
      }),
    ).toThrow(/Missing required runtime secrets/);

    expect(vars).toEqual({ EXISTING: "keep-me" });
  });

  it("allows a pre-assembly hook to populate defaults like a repo-root env var", () => {
    const input: AssembleEffectiveVarsInput = {
      vars: {},
      preAssemble: (target) => {
        if (!target.WEBPRESSO_REPO_ROOT) {
          target.WEBPRESSO_REPO_ROOT = "/repo";
        }
      },
    };

    const result = assembleEffectiveVars(input);

    expect(result.WEBPRESSO_REPO_ROOT).toBe("/repo");
  });

  it("does not overwrite an explicitly-provided var in the pre-assembly hook", () => {
    const input: AssembleEffectiveVarsInput = {
      vars: { WEBPRESSO_REPO_ROOT: "/custom/repo" },
      preAssemble: (target) => {
        if (!target.WEBPRESSO_REPO_ROOT) {
          target.WEBPRESSO_REPO_ROOT = "/repo";
        }
      },
    };

    const result = assembleEffectiveVars(input);

    expect(result.WEBPRESSO_REPO_ROOT).toBe("/custom/repo");
  });

  it("does not set DATABASE_URL when no handle is provided", () => {
    const input: AssembleEffectiveVarsInput = {
      vars: { MY_VAR: "value" },
      secretInjector: (target) => {
        target.GRAPHQL_ADMIN_SECRET = "admin";
      },
    };
    const result = assembleEffectiveVars(input);

    expect(result.DATABASE_URL).toBe(undefined);
    expect(result.MY_VAR).toBe("value");
    expect(result.GRAPHQL_ADMIN_SECRET).toBe("admin");
  });
});
