import type { DevServiceStartPlan, DevSupervisorAdapter, ServiceReadiness } from "./dev-contracts";

import { describe, expect, it, vi } from "vitest";

describe("dev-contracts", () => {
  it("models supervisor adapters without exposing an implementation-specific API", async () => {
    const starts: DevServiceStartPlan[] = [];
    const adapter: DevSupervisorAdapter = {
      name: "memory",
      async start(plan) {
        starts.push(plan);
        return { id: plan.id, status: "running" };
      },
      async stop(id) {
        return { id, status: "stopped" };
      },
      async restart(plan) {
        starts.push(plan);
        return { id: plan.id, status: "running" };
      },
      async status(id) {
        return { id, status: "running" };
      },
    };

    await expect(
      adapter.start({
        id: "api",
        command: "node",
        args: ["server.js"],
        cwd: "services/api",
        env: { PORT: "4010" },
        readiness: { type: "http", path: "/health" },
      }),
    ).resolves.toEqual({ id: "api", status: "running" });

    expect(starts).toHaveLength(1);
    expect(starts[0]?.readiness).toEqual({ type: "http", path: "/health" });
  });

  it("keeps readiness metadata generic across http, log, and manual checks", () => {
    const checks: ServiceReadiness[] = [
      { type: "http", path: "/health", timeoutMs: 30_000 },
      { type: "log", pattern: "ready on", timeoutMs: 10_000 },
      { type: "manual", description: "operator confirms service is ready" },
    ];

    expect(checks.map((check) => check.type)).toEqual(["http", "log", "manual"]);
  });

  it("does not require adapters to provide process cleanup beyond the generic methods", async () => {
    const stop = vi.fn<DevSupervisorAdapter["stop"]>().mockResolvedValue({
      id: "web",
      status: "stopped",
    });
    const adapter: Pick<DevSupervisorAdapter, "name" | "stop"> = {
      name: "minimal",
      stop,
    };

    await expect(adapter.stop("web")).resolves.toEqual({ id: "web", status: "stopped" });
    expect(stop).toHaveBeenCalledWith("web");
  });
});
