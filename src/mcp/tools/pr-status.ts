import { z } from "zod";

import type { ToolDescriptor } from "#mcp/auto-discover";

import { createSummaryOutputSchema, createSummaryResult } from "./_shared/result.js";
import {
  commandCounts,
  readonlyOpsBaseSchema,
  resolveReadonlyCwd,
  runReadonlyCommand,
} from "./_readonly-ops.js";

const inputSchema = readonlyOpsBaseSchema
  .extend({
    branch: z.string().optional(),
    includeChecks: z.boolean().optional().default(true),
    includeReviews: z.boolean().optional().default(true),
  })
  .strict();

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    cwd: z.string(),
    branch: z.string().optional(),
    pr: z.record(z.string(), z.unknown()).optional(),
    checks: z.record(z.string(), z.unknown()).optional(),
    commands: z.array(z.record(z.string(), z.unknown())),
  }),
});

function prViewFields(includeChecks: boolean, includeReviews: boolean): string {
  return [
    "number",
    "title",
    "state",
    "url",
    "baseRefName",
    "headRefName",
    "isDraft",
    "mergeable",
    "reviewDecision",
    ...(includeChecks ? ["statusCheckRollup"] : []),
    ...(includeReviews ? ["reviews"] : []),
  ].join(",");
}

const tool: ToolDescriptor = {
  name: "wp_pr_status",
  description:
    "Read-only PR status summary via GitHub CLI: branch PR metadata, optional checks, and optional reviews with bounded output.",
  inputSchema,
  outputSchema,
  annotations: {
    title: "PR status",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {});
    const cwd = resolveReadonlyCwd(input);
    const selector = input.branch ? [input.branch] : [];
    const viewArgs = [
      "pr",
      "view",
      ...selector,
      "--json",
      prViewFields(input.includeChecks, input.includeReviews),
    ];
    const commands = [
      await runReadonlyCommand("pr_status_view", "gh", viewArgs, {
        cwd,
        timeoutMs: input.timeoutMs,
        maxOutputBytes: input.maxOutputBytes,
        signal: extra?.signal,
        parseJson: true,
      }),
    ];

    if (input.includeChecks) {
      commands.push(
        await runReadonlyCommand(
          "pr_status_checks",
          "gh",
          ["pr", "checks", ...selector, "--json", "name,state,bucket,link,description"],
          {
            cwd,
            timeoutMs: input.timeoutMs,
            maxOutputBytes: input.maxOutputBytes,
            signal: extra?.signal,
            parseJson: false,
          },
        ),
      );
    }

    const failed = commands.filter((command) => !command.passed);
    const pr = commands[0]?.details as Record<string, unknown> | undefined;
    const summary =
      failed.length === 0
        ? `pr status read for #${String(pr?.number ?? "current branch")}`
        : `pr status incomplete (${failed.length}/${commands.length} command${commands.length === 1 ? "" : "s"} failed)`;

    return createSummaryResult({
      passed: failed.length === 0,
      summary,
      counts: commandCounts(commands),
      details: {
        cwd,
        branch: input.branch,
        pr,
        checks: commands[1]?.rawOutput ? { rawOutput: commands[1].rawOutput } : undefined,
        commands,
      },
      warnings: commands.flatMap((command) => command.warnings ?? []),
    });
  },
};

export default tool;
