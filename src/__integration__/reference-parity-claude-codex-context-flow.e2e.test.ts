import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildOutput as buildSessionStartOutput } from "#hooks/sessionstart/index";
import { processGuardSwitchInput } from "#hooks/guard-switch/index";
import { processPostToolUse } from "#hooks/post-tool/lint-after-edit";
import {
  buildOutput as buildPreCompactOutput,
  formatPreCompactOutput,
} from "#hooks/precompact/index";
import { buildStopHookOutput, formatStopHookJsonOutput } from "#hooks/stop/qa-changed-files";

import { referenceParityHostSmokeFixtures } from "./reference-parity-host-smoke.fixtures.js";

type FullContextHost = "claude" | "codex";

interface ParsedSessionStartOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: string;
    readonly additionalContext: string;
  };
}

const dirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "wp-claude-codex-context-flow-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function expectFullHostFixture(host: FullContextHost): void {
  const fixture = referenceParityHostSmokeFixtures.find((candidate) => candidate.host === host);
  expect(fixture).toBeDefined();
  expect(fixture?.support).toBe("full");
  expect(fixture?.projectedLifecycle).toEqual([
    "SessionStart",
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "Stop",
    "PreCompact",
  ]);
  expect(fixture?.expectedManagedCommands).toEqual([
    "wp-sessionstart-routing",
    "wp-pretool-guard",
    "wp-post-tool",
    "wp-guard-switch",
    "wp-stop-qa",
    "wp-precompact-snapshot",
  ]);
}

describe("Claude and Codex replacement-critical context flow", () => {
  it.each<FullContextHost>(["claude", "codex"])(
    "%s captures prompt/tool/stop/compact context, rejects secret leakage, and restores it through SessionStart",
    (host) => {
      expectFullHostFixture(host);

      const root = tmp();
      const dbPath = join(root, "sessions.sqlite");
      const repoHash = (): string => "repo123456789abcd";
      const sessionId = `${host}-session-1`;
      const env =
        host === "claude"
          ? { CLAUDE_PROJECT_DIR: root, WP_SESSION_MEMORY_DB: dbPath }
          : { WP_SESSION_MEMORY_DB: dbPath };
      const cwdInput = host === "codex" ? { cwd: root } : {};

      const promptResult = processGuardSwitchInput(
        {
          ...cwdInput,
          agent_id: `${host}-agent`,
          hook_event_name: "UserPromptSubmit",
          prompt: [
            "Decision: use typed continuity contracts",
            "Constraint: do not add legacy compatibility",
            "GITHUB_TOKEN=ghs-context-flow-secret",
            "Keep the context flow recoverable after compaction.",
          ].join("\n"),
          session_id: sessionId,
          transcript_path: join(root, "transcript.jsonl"),
          turn_id: "turn-1",
        },
        root,
        env,
        {
          dbPath,
          now: () => new Date("2026-06-13T08:00:00.000Z"),
          repoHash,
        },
      );
      expect(promptResult).toStrictEqual({});

      const postToolCaptured = processPostToolUse(
        {
          ...cwdInput,
          hook_event_name: "PostToolUse",
          session_id: sessionId,
          tool_input: {
            content: "export const contextFlow = true\n",
            file_path: join(root, "src", "context-flow.ts"),
          },
          tool_name: "Write",
          transcript_path: join(root, "transcript.jsonl"),
        },
        root,
        env,
        {
          dbPath,
          now: () => new Date("2026-06-13T08:01:00.000Z"),
          repoHash,
        },
      );
      expect(postToolCaptured).toBe(false);

      const preCompactOutput = buildPreCompactOutput(
        {
          ...cwdInput,
          agent_id: `${host}-agent`,
          hook_event_name: "PreCompact",
          model: "test-model",
          session_id: sessionId,
          trigger: "auto",
          turn_id: "turn-2",
        },
        root,
        env,
        {
          dbPath,
          now: () => new Date("2026-06-13T08:02:00.000Z"),
          repoHash,
        },
      );
      expect(formatPreCompactOutput(preCompactOutput)).toBe("{}");

      const stopOutput = buildStopHookOutput(
        {
          ...cwdInput,
          agent_id: `${host}-agent`,
          changed_files: ["src/context-flow.ts"],
          hook_event_name: "Stop",
          last_assistant_message: "Finished the Claude/Codex context flow proof.",
          session_id: sessionId,
          turn_id: "turn-3",
        },
        root,
        env,
        {
          dbPath,
          now: () => new Date("2026-06-13T08:03:00.000Z"),
          repoHash,
        },
      );
      expect(formatStopHookJsonOutput(stopOutput)).toBe("{}");

      const parsed = JSON.parse(
        buildSessionStartOutput(
          { ...cwdInput, source: "resume", session_id: sessionId },
          root,
          env,
          { dbPath, repoHash },
        ),
      ) as ParsedSessionStartOutput;
      const context = parsed.hookSpecificOutput.additionalContext;

      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(context).toContain(
        '<wp_session_continuity source="resume" status="complete" events="6">',
      );
      expect(context).toContain("use typed continuity contracts");
      expect(context).toContain("do not add legacy compatibility");
      expect(context).toContain("Pre-compaction snapshot boundary");
      expect(context).toContain("Write ");
      expect(context).toContain("Finished the Claude/Codex context flow proof");
      expect(context).toContain("GITHUB_TOKEN=[REDACTED]");
      expect(context).not.toContain("ghs-context-flow-secret");
    },
  );
});
