import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildProviderCommand,
  classifyClaudeExecutionFailure,
  parseClaudeAuthStatusOutput,
  runCell,
  type VariantSpawn,
} from "./variant-runner";

describe("variant-runner", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bench-runner-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds an isolated Codex exec command for provider-conformance smoke runs", () => {
    expect(
      buildProviderCommand({
        provider: "codex",
        prompt: "answer recall",
        pluginDir: "/unused/plugin",
        cwd: "/repo/worktree",
        variant: "baseline",
        lastMessagePath: "/tmp/last-message.txt",
        codexProfile: "bench-codex",
      }),
    ).toEqual([
      "codex",
      "exec",
      "--json",
      "--output-last-message",
      "/tmp/last-message.txt",
      "--sandbox",
      "workspace-write",
      "--cd",
      "/repo/worktree",
      "--profile",
      "bench-codex",
      "--ignore-user-config",
      "answer recall",
    ]);
  });

  it("runs Codex cells with isolated CODEX_HOME and inline CODEX_API_KEY only from explicit provider env", async () => {
    let seenCmd: string[] | null = null;
    let seenEnv: Record<string, string> | null = null;
    const spawn: VariantSpawn = async (cmd, options) => {
      seenCmd = cmd;
      seenEnv = options.env;
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: "agent_message", message: "queue-runner.ts" }),
        stderr: "",
      };
    };

    const result = await runCell({
      provider: "codex",
      scenario: "debug",
      prompt: "say hi",
      variant: "codex-smoke",
      trial: 1,
      pluginDir: "/tmp/plugin-unused",
      outputRoot: dir,
      cwd: "/repo/worktree-with-poisoned-config",
      apiKeys: { CODEX_API_KEY: "codex-secret" },
      codexProfile: "bench-codex",
      spawn,
    });

    expect(result.ok).toBe(true);
    expect(seenCmd).toContain("codex");
    expect(seenCmd).toContain("--ignore-user-config");
    expect(seenCmd).toContain("/repo/worktree-with-poisoned-config");
    expect(seenEnv?.CODEX_HOME).toBe(join(dir, "adhoc", "codex-smoke", "debug", "trial-1", "home"));
    expect(seenEnv?.HOME).toBe(seenEnv?.CODEX_HOME);
    expect(seenEnv?.CODEX_API_KEY).toBe("codex-secret");
    expect(seenEnv?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("runCell returns usage, tools, and transcript_path for a successful cell", async () => {
    const spawn: VariantSpawn = vi.fn(async () => ({
      exitCode: 0,
      stdout: [
        JSON.stringify({
          type: "assistant",
          timestamp: 1000,
          message: {
            content: [{ type: "tool_use", name: "wp_session_search", input: { query: "memory" } }],
            usage: {
              input_tokens: 10,
              output_tokens: 1,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        }),
        JSON.stringify({
          type: "result",
          duration_ms: 25,
          usage: {
            input_tokens: 12,
            output_tokens: 3,
            cache_creation_input_tokens: 4,
            cache_read_input_tokens: 5,
          },
        }),
      ].join("\n"),
      stderr: "",
    }));

    const result = await runCell({
      scenario: "debug",
      prompt: "say hi",
      variant: "v1",
      trial: 1,
      pluginDir: "/tmp/plugin-v1",
      outputRoot: dir,
      spawn,
    });

    expect(result).toMatchObject({
      ok: true,
      usage: {
        input_tokens: 12,
        output_tokens: 3,
        cache_creation_input_tokens: 4,
        cache_read_input_tokens: 5,
        duration_ms: 25,
      },
      local_wall_ms: expect.any(Number),
      tools: ["wp_session_search"],
    });

    expect(result.ok && existsSync(result.transcript_path)).toBe(true);
  });

  it("returns a clean rate_limit failure without leaving a partial transcript", async () => {
    const spawn: VariantSpawn = vi.fn(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "429 rate limit exceeded",
    }));

    const result = await runCell({
      scenario: "debug",
      prompt: "say hi",
      variant: "v2",
      trial: 2,
      pluginDir: "/tmp/plugin-v2",
      outputRoot: dir,
      spawn,
    });

    expect(result).toStrictEqual({
      ok: false,
      error: "rate_limit",
      failure_reason: "429 rate limit exceeded",
      usage: null,
      local_wall_ms: expect.any(Number),
      tools: [],
      transcript_path: null,
      home_dir: join(dir, "adhoc", "v2", "debug", "trial-2", "home"),
    });
    expect(existsSync(join(dir, "adhoc", "v2", "debug", "trial-2", "transcript.jsonl"))).toBe(
      false,
    );
  });

  it("does not treat failed auth-status output mentioning claude.ai as a login", () => {
    expect(parseClaudeAuthStatusOutput("", "Could not connect to claude.ai")).toEqual({
      kind: "missing",
      reason: "Could not connect to claude.ai",
    });
  });

  it("bounds raw rate-limit failure output", async () => {
    const noisyFailure = `429 rate limit ${"x".repeat(900)}`;
    const spawn: VariantSpawn = vi.fn(async () => ({
      exitCode: 1,
      stdout: noisyFailure,
      stderr: "",
    }));

    const result = await runCell({
      scenario: "debug",
      prompt: "say hi",
      variant: "bounded-rate-limit",
      trial: 1,
      pluginDir: "/tmp/plugin-v2",
      outputRoot: dir,
      spawn,
    });

    expect(result.ok).toBe(false);
    expect(result.failure_reason?.length).toBeLessThanOrEqual(612);
    expect(result.failure_reason).toContain("[truncated]");
  });

  it("passes the per-variant API key through the spawned environment", async () => {
    let seenEnv: Record<string, string> | null = null;
    const spawn: VariantSpawn = async (_cmd, options) => {
      seenEnv = options.env;
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: "result",
          duration_ms: 1,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }),
        stderr: "",
      };
    };

    await runCell({
      scenario: "debug",
      prompt: "say hi",
      variant: "main",
      trial: 3,
      pluginDir: "/tmp/plugin-main",
      outputRoot: dir,
      apiKeys: {
        ANTHROPIC_API_KEY_MAIN: "secret-main",
      },
      spawn,
    });

    expect(seenEnv?.ANTHROPIC_API_KEY).toBe("secret-main");
  });

  it("uses claude auth status and the logged-in Claude home for explicit claude-login auth mode", async () => {
    const originalAuthMode = process.env.BENCH_AUTH_MODE;
    const originalBenchClaudeHome = process.env.BENCH_CLAUDE_HOME;
    const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const originalClaudeApiKey = process.env.CLAUDE_API_KEY;
    const originalVariantApiKey = process.env.ANTHROPIC_API_KEY_BASELINE;
    process.env.BENCH_AUTH_MODE = "claude-login";
    process.env.BENCH_CLAUDE_HOME = "/tmp/logged-in-claude-home";
    process.env.ANTHROPIC_API_KEY = "ambient-anthropic-secret";
    process.env.CLAUDE_API_KEY = "ambient-claude-secret";
    process.env.ANTHROPIC_API_KEY_BASELINE = "ambient-variant-secret";

    const seenCommands: string[][] = [];
    let seenEnv: Record<string, string> | null = null;
    const spawn: VariantSpawn = async (cmd, options) => {
      seenCommands.push(cmd);
      seenEnv = options.env;
      if (cmd.join(" ") === "claude auth status") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            loggedIn: true,
            provider: "claude.ai",
            email: "dev@example.com",
            subscriptionType: "Max",
          }),
          stderr: "",
        };
      }

      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: "result",
          duration_ms: 1,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }),
        stderr: "",
      };
    };

    let result: Awaited<ReturnType<typeof runCell>>;
    try {
      result = await runCell({
        scenario: "debug",
        prompt: "say hi",
        variant: "baseline",
        trial: 4,
        pluginDir: "/tmp/plugin-main",
        outputRoot: dir,
        authMode: "claude-login",
        claudeHome: "/tmp/logged-in-claude-home",
        spawn,
      });
    } finally {
      if (originalAuthMode === undefined) delete process.env.BENCH_AUTH_MODE;
      else process.env.BENCH_AUTH_MODE = originalAuthMode;
      if (originalBenchClaudeHome === undefined) delete process.env.BENCH_CLAUDE_HOME;
      else process.env.BENCH_CLAUDE_HOME = originalBenchClaudeHome;
      if (originalAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
      if (originalClaudeApiKey === undefined) delete process.env.CLAUDE_API_KEY;
      else process.env.CLAUDE_API_KEY = originalClaudeApiKey;
      if (originalVariantApiKey === undefined) delete process.env.ANTHROPIC_API_KEY_BASELINE;
      else process.env.ANTHROPIC_API_KEY_BASELINE = originalVariantApiKey;
    }

    expect(result!.ok).toBe(true);
    expect(seenCommands.map((cmd) => cmd.slice(0, 3))).toEqual([
      ["claude", "auth", "status"],
      ["claude", "--print", "--verbose"],
    ]);
    expect(seenEnv?.HOME).toBe("/tmp/logged-in-claude-home");
    expect(seenEnv?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(seenEnv?.CLAUDE_API_KEY).toBeUndefined();
    expect(seenEnv?.ANTHROPIC_API_KEY_BASELINE).toBeUndefined();
  });

  it("parses first-party Claude CLI auth status without an API key", () => {
    expect(
      parseClaudeAuthStatusOutput(
        JSON.stringify({
          loggedIn: true,
          provider: "claude.ai",
          email: "dev@example.com",
          subscriptionType: "Max",
        }),
      ),
    ).toStrictEqual({
      kind: "cli-login",
      provider: "firstParty",
      email: "dev@example.com",
      subscriptionType: "Max",
    });
  });

  it("classifies 401 after valid CLI auth as a stale Claude CLI session", () => {
    expect(
      classifyClaudeExecutionFailure({
        authMode: "claude-login",
        authState: { kind: "cli-login", provider: "firstParty" },
        stdout: "",
        stderr: "HTTP 401 unauthorized",
      }),
    ).toStrictEqual({
      kind: "execution-failed",
      auth: "cli-login",
      status: 401,
      message:
        "Claude CLI auth status reports a logged-in first-party session, but claude execution returned 401. Refresh the Claude CLI login/session and retry.",
    });
  });

  it("returns a stale-session failure reason when claude -p fails after auth status succeeds", async () => {
    const spawn: VariantSpawn = async (cmd) => {
      if (cmd.join(" ") === "claude auth status") {
        return {
          exitCode: 0,
          stdout: "Logged in to claude.ai as dev@example.com (Max)",
          stderr: "",
        };
      }
      return { exitCode: 1, stdout: "", stderr: "HTTP 401 unauthorized" };
    };

    const result = await runCell({
      scenario: "debug",
      prompt: "say hi",
      variant: "baseline",
      trial: 5,
      pluginDir: "/tmp/plugin-main",
      outputRoot: dir,
      authMode: "claude-login",
      claudeHome: "/tmp/logged-in-claude-home",
      spawn,
    });

    expect(result).toStrictEqual({
      ok: false,
      error: "spawn_failed",
      failure_reason:
        "Claude CLI auth status reports a logged-in first-party session, but claude execution returned 401. Refresh the Claude CLI login/session and retry.",
      usage: null,
      local_wall_ms: expect.any(Number),
      tools: [],
      transcript_path: null,
      home_dir: join(dir, "adhoc", "baseline", "debug", "trial-5", "home"),
    });
  });

  it("does not treat generic max/pro error text as a CLI login", () => {
    expect(parseClaudeAuthStatusOutput("", "HTTP 429: max connections exceeded")).toStrictEqual({
      kind: "missing",
      reason: "HTTP 429: max connections exceeded",
    });
    expect(parseClaudeAuthStatusOutput("proxy protocol error")).toStrictEqual({
      kind: "missing",
      reason: "proxy protocol error",
    });
  });

  it("returns a diagnostic failure reason when claude auth status output is unrecognized", async () => {
    const spawn: VariantSpawn = async (cmd) => {
      if (cmd.join(" ") === "claude auth status") {
        return { exitCode: 0, stdout: "HTTP 429: max connections exceeded", stderr: "" };
      }
      throw new Error("claude execution should not run without recognized CLI auth");
    };

    const result = await runCell({
      scenario: "debug",
      prompt: "say hi",
      variant: "baseline",
      trial: 6,
      pluginDir: "/tmp/plugin-main",
      outputRoot: dir,
      authMode: "claude-login",
      claudeHome: "/tmp/logged-in-claude-home",
      spawn,
    });

    expect(result).toStrictEqual({
      ok: false,
      error: "spawn_failed",
      failure_reason: "HTTP 429: max connections exceeded",
      usage: null,
      local_wall_ms: 0,
      tools: [],
      transcript_path: null,
      home_dir: join(dir, "adhoc", "baseline", "debug", "trial-6", "home"),
    });
  });
});
