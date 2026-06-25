import type { Failure, TransformContext, TransformResult } from "./index.js";
import { createTransformResult } from "./metadata.js";
import { passthroughTransform } from "./passthrough.js";

const MAX_OUTPUT_BYTES = 4_000;

interface RulesyncTarget {
  readonly target: string;
  readonly skills: number;
  readonly commands: number;
  readonly agents: number;
  readonly failed: boolean;
  readonly failureDetail?: string;
}

// Matches: ✓ Claude Code: 3 skills, 2 commands, 1 agent
const SUCCESS_LINE_RE =
  /^[✓✔]\s+([\w\s]+?):\s+(\d+)\s+skills?,\s+(\d+)\s+commands?,\s+(\d+)\s+agents?/u;
// Matches: ✗ Cursor: failed to write .cursor/rules/foo.md: EACCES
const FAILURE_LINE_RE = /^[✗✘]\s+([\w\s]+?):\s+(.+)$/u;
// Summary line: Generated in 120ms
const SUMMARY_LINE_RE = /^Generated in \d+ms$/u;

function parseRulesyncOutput(raw: string): {
  targets: RulesyncTarget[];
  hasSummaryLine: boolean;
} {
  const targets: RulesyncTarget[] = [];
  let hasSummaryLine = false;

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (SUMMARY_LINE_RE.test(trimmed)) {
      hasSummaryLine = true;
      continue;
    }

    const successMatch = SUCCESS_LINE_RE.exec(trimmed);
    if (successMatch) {
      targets.push({
        target: successMatch[1]?.trim() ?? "",
        skills: parseInt(successMatch[2] ?? "0", 10),
        commands: parseInt(successMatch[3] ?? "0", 10),
        agents: parseInt(successMatch[4] ?? "0", 10),
        failed: false,
      });
      continue;
    }

    const failureMatch = FAILURE_LINE_RE.exec(trimmed);
    if (failureMatch) {
      targets.push({
        target: failureMatch[1]?.trim() ?? "",
        skills: 0,
        commands: 0,
        agents: 0,
        failed: true,
        failureDetail: failureMatch[2]?.trim(),
      });
    }
  }

  return { targets, hasSummaryLine };
}

function buildSummaryLine(targets: readonly RulesyncTarget[]): string {
  const total = targets.length;
  const failed = targets.filter((t) => t.failed).length;
  const passed = total - failed;
  if (failed === 0) return `rulesync: ${passed} target${passed === 1 ? "" : "s"} synced`;
  return `rulesync: ${passed}/${total} targets synced, ${failed} failed`;
}

export function rulesyncTransform(
  rawOutput: string | undefined,
  context: TransformContext,
): TransformResult {
  if (!rawOutput) return {};

  const { targets, hasSummaryLine } = parseRulesyncOutput(rawOutput);

  if (targets.length === 0 && !hasSummaryLine) {
    return passthroughTransform(rawOutput, context);
  }

  const failures: Failure[] = targets
    .filter((t) => t.failed)
    .map((t) => ({
      message: t.failureDetail ? `${t.target}: ${t.failureDetail}` : `${t.target}: failed`,
    }));

  const summaryLine = buildSummaryLine(targets);

  const successLines = targets
    .filter((t) => !t.failed)
    .map((t) => `  ${t.target}: ${t.skills} skills, ${t.commands} commands, ${t.agents} agents`);

  const failureLines = targets
    .filter((t) => t.failed)
    .map((t) => `  ${t.target}: FAILED — ${t.failureDetail ?? "unknown error"}`);

  const compactOutput = [summaryLine, ...successLines, ...failureLines].join("\n");

  // Clip to 4000 bytes via createTransformResult
  return createTransformResult(rawOutput, compactOutput.slice(0, MAX_OUTPUT_BYTES), context, {
    tier: 1,
    failures,
  });
}
