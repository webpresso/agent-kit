import { afterEach, describe, expect, it, vi } from "vitest";

import tool from "./worker-tail.js";

const runSecretGateCommandMock = vi.hoisted(() => vi.fn());

vi.mock("#secret-gate/runner.js", async () => {
  const actual =
    await vi.importActual<typeof import("#secret-gate/runner.js")>("#secret-gate/runner.js");
  return {
    ...actual,
    runSecretGateCommand: runSecretGateCommandMock,
  };
});

afterEach(() => {
  runSecretGateCommandMock.mockReset();
});

describe("wp_worker_tail tool", () => {
  it("returns dry-run command by default", async () => {
    const result = await tool.handler({ worker: "webpresso-chef-alpha", environment: "preview" });
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.passed).toBe(true);
    expect(payload.summary).toContain("dry-run");
    const details = payload.details as { command: { command: string; args: string[] } };
    expect(details.command).toEqual({
      command: "wp",
      args: [
        "secrets",
        "run",
        "--sink",
        "deploy-wrangler",
        "--profile",
        "preview",
        "--",
        "wrangler",
        "tail",
        "webpresso-chef-alpha",
        "--format",
        "json",
        "--status",
        "error",
        "--env",
        "preview",
      ],
    });
    expect(details.command.args.join(" ")).not.toContain("--env-profile");
    expect(JSON.stringify(payload)).not.toMatch(/doppler|infisical|secret-manager/u);
  });

  it("captures JSON events when executing", async () => {
    runSecretGateCommandMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ level: "error", message: "boom" }) + "\n",
      stderr: "",
      timedOut: false,
      aborted: false,
      signal: null,
    });

    const result = await tool.handler({
      worker: "webpresso-chef-alpha",
      execute: true,
      maxEvents: 5,
    });

    expect(runSecretGateCommandMock).toHaveBeenCalledOnce();
    expect(runSecretGateCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "wrangler",
        args: ["tail", "webpresso-chef-alpha", "--format", "json", "--status", "error"],
        maxOutputBytes: 65536,
      }),
    );
    expect(runSecretGateCommandMock.mock.calls[0]![0]).not.toHaveProperty("envProfile");
    expect(runSecretGateCommandMock.mock.calls[0]![0]).not.toHaveProperty("runner");
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.passed).toBe(true);
    expect((payload.events as unknown[]).length).toBe(1);
    const details = payload.details as { command: { command: string; args: string[] } };
    expect(details.command.command).toBe("wp");
    expect(details.command.args.slice(0, 10)).toEqual([
      "secrets",
      "run",
      "--sink",
      "deploy-wrangler",
      "--profile",
      "preview",
      "--",
      "wrangler",
      "tail",
      "webpresso-chef-alpha",
    ]);
    expect(details.command.args.join(" ")).not.toContain("--env-profile");
  });
});
