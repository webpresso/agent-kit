import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OPENCODE_PLUGIN_CONTENT,
  OPENCODE_PLUGIN_RELATIVE_PATH,
  OPENCODE_PLUGIN_SUPPORT_LEVEL,
  scaffoldOpencodePlugin,
} from "./index";

const tempRoots: string[] = [];
function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "opencode-plugin-scaffolder-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("scaffoldOpencodePlugin", () => {
  it("keeps the generated OpenCode plugin path and support level explicit", () => {
    expect(OPENCODE_PLUGIN_RELATIVE_PATH).toBe(".opencode/plugins/webpresso-hooks.js");
    expect(OPENCODE_PLUGIN_SUPPORT_LEVEL).toBe("degraded");
  });

  it("creates the plugin file under .opencode/plugins on first run", () => {
    const repoRoot = createTempRoot();
    const result = scaffoldOpencodePlugin({ repoRoot, options: {} });

    expect(result.action).toBe("created");
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    expect(result.targetPath).toBe(targetPath);
    expect(readFileSync(targetPath, "utf8")).toBe(OPENCODE_PLUGIN_CONTENT);
  });

  it("is idempotent — re-running on identical content returns identical", () => {
    const repoRoot = createTempRoot();
    scaffoldOpencodePlugin({ repoRoot, options: {} });
    const second = scaffoldOpencodePlugin({ repoRoot, options: {} });

    expect(second.action).toBe("identical");
  });

  it("refreshes the generated plugin when local content has drifted", () => {
    const repoRoot = createTempRoot();
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    mkdirSync(join(repoRoot, ".opencode/plugins"), { recursive: true });
    writeFileSync(targetPath, "// consumer custom content\n", "utf8");

    const result = scaffoldOpencodePlugin({ repoRoot, options: {} });

    expect(result.action).toBe("overwritten");
    expect(readFileSync(targetPath, "utf8")).toBe(OPENCODE_PLUGIN_CONTENT);
    expect(() => readFileSync(`${targetPath}.new`, "utf8")).toThrow();
  });

  it("overwrites consumer content when --overwrite is set", () => {
    const repoRoot = createTempRoot();
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    mkdirSync(join(repoRoot, ".opencode/plugins"), { recursive: true });
    writeFileSync(targetPath, "// consumer custom content\n", "utf8");

    const result = scaffoldOpencodePlugin({ repoRoot, options: { overwrite: true } });

    expect(result.action).toBe("overwritten");
    expect(readFileSync(targetPath, "utf8")).toBe(OPENCODE_PLUGIN_CONTENT);
  });

  it("skips writes in --dry-run mode", () => {
    const repoRoot = createTempRoot();
    const result = scaffoldOpencodePlugin({ repoRoot, options: { dryRun: true } });

    expect(result.action).toBe("skipped-dry");
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    expect(() => readFileSync(targetPath, "utf8")).toThrow();
  });
});

describe("plugin-native invariants — webpresso-hooks.js", () => {
  it("scaffolder produces byte-identical output on first and second run", () => {
    const repoRoot = createTempRoot();
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);

    scaffoldOpencodePlugin({ repoRoot, options: {} });
    const firstContent = readFileSync(targetPath, "utf8");

    scaffoldOpencodePlugin({ repoRoot, options: {} });
    const secondContent = readFileSync(targetPath, "utf8");

    expect(firstContent).toStrictEqual(OPENCODE_PLUGIN_CONTENT);
    expect(secondContent).toStrictEqual(OPENCODE_PLUGIN_CONTENT);
  });
});

describe("OPENCODE_PLUGIN_CONTENT", () => {
  it("embeds the concrete OpenCode instruction surface from the shared renderer", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain(
      "OpenCode instruction surface generated from the shared wp_routing source",
    );
    expect(OPENCODE_PLUGIN_CONTENT).toContain('<wp_instruction_surface host="opencode"');
    expect(OPENCODE_PLUGIN_CONTENT).toContain(
      "wp_test, wp_e2e, wp_lint, wp_typecheck, wp_qa, wp_audit, wp_audits, wp_ci_act, wp_worker_tail, wp_pr_status, wp_bench, wp_gain, wp_release_readiness",
    );
    expect(OPENCODE_PLUGIN_CONTENT).not.toContain("generic plugin");
  });

  it("exports an async plugin function as required by opencode plugin contract", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("export const WebpressoHooksPlugin");
    expect(OPENCODE_PLUGIN_CONTENT).toContain("async ({ $, directory })");
    expect(OPENCODE_PLUGIN_CONTENT).toContain("Support boundary: degraded plugin bridge");
  });

  it("does not use replacement parity overclaim wording in generated OpenCode text", () => {
    expect(OPENCODE_PLUGIN_CONTENT).not.toMatch(/\bparity\b/iu);
  });

  it("shells out to canonical wp hook subcommands", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("wp hook sessionstart-routing");
  });

  it("subscribes to session.created for first-run detection", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("event?.type === 'session.created'");
  });

  it("bridges PreToolUse and PostToolUse through OpenCode tool hooks", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain('"tool.execute.before"');
    expect(OPENCODE_PLUGIN_CONTENT).toContain('"tool.execute.after"');
    expect(OPENCODE_PLUGIN_CONTENT).toContain("permissionDecision");
    expect(OPENCODE_PLUGIN_CONTENT).toContain("throw new Error");
  });

  it("injects CLAUDE_PROJECT_DIR into OpenCode shell execution env", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain('"shell.env"');
    expect(OPENCODE_PLUGIN_CONTENT).toContain("output.env.CLAUDE_PROJECT_DIR = input.cwd");
  });

  it("uses experimental.session.compacting for context survival across compaction", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("'experimental.session.compacting'");
    expect(OPENCODE_PLUGIN_CONTENT).toContain("output.context.push(message)");
    expect(OPENCODE_PLUGIN_CONTENT).toContain("degraded context refresh");
  });

  it("does not imply unsupported OpenCode lifecycle handlers are available", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("Unsupported managed lifecycle events:");
    expect(OPENCODE_PLUGIN_CONTENT).toContain("UserPromptSubmit");
    expect(OPENCODE_PLUGIN_CONTENT).toContain("Stop");
    expect(OPENCODE_PLUGIN_CONTENT).not.toContain('"UserPromptSubmit"');
    expect(OPENCODE_PLUGIN_CONTENT).not.toContain('"Stop"');
    expect(OPENCODE_PLUGIN_CONTENT).not.toContain("permission.asked");
  });

  it("blocks tool execution by throwing when a canonical wp hook denies", () => {
    expect(OPENCODE_PLUGIN_CONTENT).toContain("throw new Error");
  });

  it("executes as a real plugin and propagates breakage context through session and compaction hooks", async () => {
    const repoRoot = createTempRoot();
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    scaffoldOpencodePlugin({ repoRoot, options: {} });

    const mod = (await import(`${pathToFileURL(targetPath).href}?t=${Date.now()}`)) as {
      WebpressoHooksPlugin: (input: {
        $: (
          strings: TemplateStringsArray,
          ...values: string[]
        ) => {
          cwd: (directory: string) => {
            quiet: () => { nothrow: () => Promise<{ exitCode: number; stdout: Buffer }> };
          };
        };
        directory: string;
      }) => Promise<{
        event: (input: { event: { type: string } }) => Promise<void>;
        "experimental.session.compacting": (
          _input: unknown,
          output: { context: string[] },
        ) => Promise<void>;
      }>;
    };

    const $ = (_strings: TemplateStringsArray, ..._values: string[]) => {
      return {
        cwd: (_directory: string) => ({
          quiet: () => ({
            nothrow: async () => {
              return {
                exitCode: 0,
                stdout: Buffer.from(
                  JSON.stringify({
                    hookSpecificOutput: {
                      additionalContext: "dev-link-broken",
                    },
                  }),
                ),
              };
            },
          }),
        }),
      };
    };

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const plugin = await mod.WebpressoHooksPlugin({ $, directory: repoRoot });
    await plugin.event({ event: { type: "session.created" } });
    const output = { context: [] as string[] };
    await plugin["experimental.session.compacting"]({}, output);
    stderrSpy.mockRestore();

    expect(output.context).toContain("dev-link-broken");
  });

  it("translates a deny envelope from wp-pretool-guard into an OpenCode throw", async () => {
    const repoRoot = createTempRoot();
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    scaffoldOpencodePlugin({ repoRoot, options: {} });

    const mod = (await import(`${pathToFileURL(targetPath).href}?t=${Date.now()}`)) as {
      WebpressoHooksPlugin: (input: {
        $: (
          strings: TemplateStringsArray,
          ...values: string[]
        ) => {
          cwd: (directory: string) => {
            quiet: () => { nothrow: () => Promise<{ exitCode: number; stdout: Buffer }> };
          };
        };
        directory: string;
      }) => Promise<{
        "tool.execute.before": (
          input: { tool: string; args: { command?: string } },
          output: { args: { command?: string } },
        ) => Promise<void>;
        "shell.env": (
          input: { cwd: string },
          output: { env: Record<string, string> },
        ) => Promise<void>;
      }>;
    };

    const $ = (_strings: TemplateStringsArray, ...values: string[]) => {
      return {
        cwd: (_directory: string) => ({
          quiet: () => ({
            nothrow: async () => {
              const command = values.find((value) => value.includes("wp hook ")) ?? "";
              if (command.includes("wp hook pretool-guard")) {
                return {
                  exitCode: 0,
                  stdout: Buffer.from(
                    JSON.stringify({
                      hookSpecificOutput: {
                        hookEventName: "PreToolUse",
                        permissionDecision: "deny",
                        permissionDecisionReason: "use wp_test",
                      },
                    }),
                  ),
                };
              }

              return { exitCode: 0, stdout: Buffer.from("{}") };
            },
          }),
        }),
      };
    };

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const plugin = await mod.WebpressoHooksPlugin({ $, directory: repoRoot });
    await expect(
      plugin["tool.execute.before"](
        { tool: "bash", args: { command: "npm test" } },
        { args: { command: "npm test" } },
      ),
    ).rejects.toThrow("use wp_test");
    stderrSpy.mockRestore();

    const envOutput = { env: {} as Record<string, string> };
    await plugin["shell.env"]({ cwd: repoRoot }, envOutput);
    expect(envOutput.env.CLAUDE_PROJECT_DIR).toBe(repoRoot);
  });

  it("passes OpenCode tool output through the PostToolUse bridge without blocking", async () => {
    const repoRoot = createTempRoot();
    const targetPath = join(repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    scaffoldOpencodePlugin({ repoRoot, options: {} });

    const mod = (await import(`${pathToFileURL(targetPath).href}?t=${Date.now()}`)) as {
      WebpressoHooksPlugin: (input: {
        $: (
          strings: TemplateStringsArray,
          ...values: string[]
        ) => {
          cwd: (directory: string) => {
            quiet: () => { nothrow: () => Promise<{ exitCode: number; stdout: Buffer }> };
          };
        };
        directory: string;
      }) => Promise<{
        "tool.execute.after": (
          input: { tool: string; args: { command?: string } },
          output: { args: { command?: string } },
        ) => Promise<void>;
      }>;
    };

    const commands: string[] = [];
    const payloads: string[] = [];
    const $ = (_strings: TemplateStringsArray, ...values: string[]) => {
      payloads.push(values[0] ?? "");
      commands.push(values.find((value) => value.includes("wp hook ")) ?? "");
      return {
        cwd: (_directory: string) => ({
          quiet: () => ({
            nothrow: async () => ({ exitCode: 0, stdout: Buffer.from("not-json") }),
          }),
        }),
      };
    };

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const plugin = await mod.WebpressoHooksPlugin({ $, directory: repoRoot });
    await expect(
      plugin["tool.execute.after"](
        { tool: "bash", args: { command: "wp test" } },
        { args: { command: "wp test" } },
      ),
    ).resolves.toBeUndefined();
    stderrSpy.mockRestore();

    expect(commands).toContain("wp hook post-tool");
    expect(payloads.some((payload) => payload.includes('"tool_name":"Bash"'))).toBe(true);
    expect(payloads.some((payload) => payload.includes('"command":"wp test"'))).toBe(true);
  });
});
