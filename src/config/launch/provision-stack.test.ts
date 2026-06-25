/**
 * Generic provision-stack descriptor-orchestration tests.
 *
 * Proves that `buildLaunchRegistration` produces the same observable output
 * as the cli-utils wrangler descriptor used to, over an abstract
 * {@link ProvisionedDatabaseHandle} and a caller-supplied spawn-plan builder.
 */

import type { LaunchProfile, ProvisionedDatabaseHandle } from "./contracts";

import { describe, expect, it } from "vitest";

import { buildLaunchRegistration } from "./provision-stack";

function fixedPortAllocator(): () => Promise<{ apiPort: number; inspectorPort: number }> {
  return async () => ({ apiPort: 4111, inspectorPort: 9333 });
}

function noopInjector(): (vars: Record<string, string>) => void {
  return () => {};
}

describe("provision-stack: buildLaunchRegistration", () => {
  it("returns a registration carrying the allocated ports and caller cwd", async () => {
    const profile: LaunchProfile = {
      cwd: "/repo/apps/workers/generic-worker",
      vars: { CUSTOM_VAR: "custom-value" },
      logFile: "/tmp/generic.log",
    };

    const registration = await buildLaunchRegistration({
      profile,
      allocatePorts: fixedPortAllocator(),
      secretInjector: noopInjector(),
      buildSpawnPlan: (context) => ({
        command: "custom-runner",
        args: ["--port", String(context.ports.api)],
        env: { ...context.effectiveVars, CUSTOM_EXTRA: "x" },
      }),
    });

    expect(registration.cwd).toBe("/repo/apps/workers/generic-worker");
    expect(registration.ports.api).toBe(4111);
    expect(registration.ports.inspector).toBe(9333);
    expect(registration.logFile).toBe("/tmp/generic.log");
    expect(registration.command).toBe("custom-runner");
    expect(registration.args).toEqual(["--port", "4111"]);
    expect(registration.env.CUSTOM_VAR).toBe("custom-value");
    expect(registration.env.CUSTOM_EXTRA).toBe("x");
  });

  it("runs the secret injector over a copy of the profile vars before the spawn plan sees them", async () => {
    const originalVars = { PUBLIC_VAR: "ok" };
    const profile: LaunchProfile = {
      cwd: "/repo/apps/workers/generic",
      vars: originalVars,
    };

    const registration = await buildLaunchRegistration({
      profile,
      allocatePorts: fixedPortAllocator(),
      secretInjector: (vars) => {
        vars.INJECTED_SECRET = "secret-value";
      },
      buildSpawnPlan: (context) => ({
        command: "runner",
        args: [],
        env: { ...context.effectiveVars },
      }),
    });

    expect(registration.env.INJECTED_SECRET).toBe("secret-value");
    expect(registration.env.PUBLIC_VAR).toBe("ok");
    // Must not have mutated the caller's vars object
    expect(originalVars).toEqual({ PUBLIC_VAR: "ok" });
  });

  it("drives database-url assembly through the supplied handle + selector", async () => {
    const databaseHandle: ProvisionedDatabaseHandle = {
      id: "db-generic-1",
      primaryConnectionUri: "postgresql://primary/db",
      applicationConnectionUri: "postgresql://app/db",
      runtimeConnectionUri: "postgresql://runtime/db",
    };

    const profile: LaunchProfile = {
      cwd: "/repo/apps/workers/generic",
      vars: {},
      databaseHandle,
      databaseUrlSelector: (handle) => ({
        runtimeDatabaseUrl: handle.runtimeConnectionUri ?? handle.primaryConnectionUri,
      }),
    };

    const registration = await buildLaunchRegistration({
      profile,
      allocatePorts: fixedPortAllocator(),
      secretInjector: noopInjector(),
      buildSpawnPlan: (context) => ({
        command: "runner",
        args: [],
        env: { ...context.effectiveVars },
      }),
    });

    expect(registration.env.DATABASE_URL).toBe("postgresql://runtime/db");
    expect(registration.databaseHandle).toBe(databaseHandle);
  });

  it("passes the provisioned database handle and allocated ports to the spawn-plan builder", async () => {
    const databaseHandle: ProvisionedDatabaseHandle = {
      id: "db-1",
      primaryConnectionUri: "postgresql://primary/db",
    };
    const profile: LaunchProfile = {
      cwd: "/repo/apps/workers/generic",
      vars: {},
      databaseHandle,
    };

    let capturedHandle: ProvisionedDatabaseHandle | undefined;
    let capturedPorts: { api: number; inspector: number } | undefined;

    await buildLaunchRegistration({
      profile,
      allocatePorts: fixedPortAllocator(),
      secretInjector: noopInjector(),
      buildSpawnPlan: (context) => {
        capturedHandle = context.databaseHandle;
        capturedPorts = context.ports;
        return { command: "runner", args: [], env: {} };
      },
    });

    expect(capturedHandle).toBe(databaseHandle);
    expect(capturedPorts).toEqual({ api: 4111, inspector: 9333 });
  });

  it("awaits the async port allocator exactly once", async () => {
    let allocatorCalls = 0;
    const profile: LaunchProfile = {
      cwd: "/repo/apps/workers/generic",
      vars: {},
    };

    await buildLaunchRegistration({
      profile,
      allocatePorts: async () => {
        allocatorCalls += 1;
        return { apiPort: 5111, inspectorPort: 9555 };
      },
      secretInjector: noopInjector(),
      buildSpawnPlan: () => ({ command: "runner", args: [], env: {} }),
    });

    expect(allocatorCalls).toBe(1);
  });
});
