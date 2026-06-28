import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateBlueprintTrust } from "./validator.js";
import { parseTrustDossier } from "./dossier.js";
import { parseAllowedWpCommand } from "./gates.js";

export { parseAllowedWpCommand };

export type PromotionTrustInput = {
  repoRoot: string;
  file: string;
  markdown: string;
  now?: Date;
};

export function applyPromotionTrustGate(input: PromotionTrustInput): string {
  const now = (input.now ?? new Date()).toISOString();
  const syntacticMarkdown = upsertReadinessValue(
    upsertReadinessValue(input.markdown, "verified-at", now),
    "verified-head",
    "0123456789abcdef0123456789abcdef01234567",
  );
  const parsedBeforeHead = parseTrustDossier(syntacticMarkdown);
  if (parsedBeforeHead.violations.length > 0)
    throw new Error(
      `Blueprint trust gate failed: ${parsedBeforeHead.violations.map((v) => `${v.section}: ${v.message}`).join("; ")}`,
    );

  const head = readHead(input.repoRoot);
  let markdown = upsertReadinessValue(input.markdown, "verified-at", now);
  markdown = upsertReadinessValue(markdown, "verified-head", head);
  const preflight = validateBlueprintTrust({
    repoRoot: input.repoRoot,
    file: input.file,
    status: "draft",
    markdown,
    promotionCandidate: true,
    requirePassingGates: false,
    scanTaskAmbiguity: true,
  });
  if (!preflight.ok)
    throw new Error(
      `Blueprint trust gate failed: ${preflight.violations.map((v) => `${v.section}: ${v.message}`).join("; ")}`,
    );
  const parsed = parseTrustDossier(markdown);
  for (const gate of parsed.dossier?.gates ?? []) {
    runPromotionCommand(input.repoRoot, gate.command);
    markdown = updateGateLastResult(markdown, gate.gate, `pass at ${now}`);
  }
  const validated = validateBlueprintTrust({
    repoRoot: input.repoRoot,
    file: input.file,
    status: "draft",
    markdown,
    promotionCandidate: true,
    scanTaskAmbiguity: true,
  });
  if (!validated.ok)
    throw new Error(
      `Blueprint trust gate failed: ${validated.violations.map((v) => `${v.section}: ${v.message}`).join("; ")}`,
    );
  return markdown;
}

function readHead(repoRoot: string): string {
  const testHead = process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"];
  if (process.env["VITEST"] === "true" && testHead && /^[a-f0-9]{40}$/iu.test(testHead)) {
    return testHead;
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("Blueprint trust gate failed: git HEAD is unavailable");
  }
}

export type PromotionCommandOptions = {
  timeoutMs?: number;
  now?: Date;
};

const PROMOTION_GATE_TIMEOUT_MS = 30_000;
const PROMOTION_GATE_TAIL_LIMIT = 500;

export function runPromotionCommand(
  repoRoot: string,
  command: string,
  options: PromotionCommandOptions = {},
): void {
  const argv = parseAllowedWpCommand(command);
  const [binary, ...args] = argv;
  if (binary === undefined) throw new Error(`Promotion gate command is empty: ${command}`);
  const executable = resolveWpExecutable(repoRoot, binary);
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? PROMOTION_GATE_TIMEOUT_MS,
    env: { ...process.env, PATH: `${path.join(repoRoot, "bin")}:${process.env["PATH"] ?? ""}` },
  });
  if (result.status === 0 && result.error === undefined) return;

  const logPath = writePromotionGateLog(repoRoot, command, executable, args, result, options.now);
  throw new Error(
    formatPromotionGateFailure(
      command,
      result,
      logPath,
      options.timeoutMs ?? PROMOTION_GATE_TIMEOUT_MS,
    ),
  );
}

function resolveWpExecutable(repoRoot: string, binary: string): string {
  if (binary === "wp" || binary === "./bin/wp") return path.join(repoRoot, "bin", "wp");
  return binary;
}

function formatPromotionGateFailure(
  command: string,
  result: ReturnType<typeof spawnSync>,
  logPath: string,
  timeoutMs: number,
): string {
  const parts = [describePromotionGateStatus(result, timeoutMs)];
  const stderrTail = boundedTail(result.stderr);
  const stdoutTail = boundedTail(result.stdout);
  if (stderrTail) parts.push(`stderr: ${stderrTail}`);
  if (stdoutTail) parts.push(`stdout: ${stdoutTail}`);
  parts.push(`log: ${logPath}`);
  return `Promotion gate failed (${command}): ${parts.join("; ")}`;
}

function describePromotionGateStatus(
  result: ReturnType<typeof spawnSync>,
  timeoutMs: number,
): string {
  if (isTimeoutResult(result)) return `timeout after ${timeoutMs}ms`;
  if (result.status !== null) return `exit code ${result.status}`;
  if (result.signal) return `signal ${result.signal}`;
  if (result.error) return `launch error: ${result.error.message}`;
  return "unknown failure";
}

function isTimeoutResult(result: ReturnType<typeof spawnSync>): boolean {
  const error = result.error as NodeJS.ErrnoException | undefined;
  return error?.code === "ETIMEDOUT";
}

function boundedTail(value: string | Buffer | null | undefined): string {
  const text = typeof value === "string" ? value : (value?.toString("utf8") ?? "");
  return text.trim().slice(-PROMOTION_GATE_TAIL_LIMIT);
}

function writePromotionGateLog(
  repoRoot: string,
  command: string,
  executable: string,
  args: string[],
  result: ReturnType<typeof spawnSync>,
  now = new Date(),
): string {
  const relativeLogPath = path.join(
    "logs",
    "blueprint-promotion-gates",
    now.toISOString().slice(0, 10),
    `${now.toISOString().replace(/[:.]/gu, "-")}.log`,
  );
  const absoluteLogPath = path.join(repoRoot, relativeLogPath);
  mkdirSync(path.dirname(absoluteLogPath), { recursive: true });
  const log = [
    `command: ${command}`,
    `executable: ${executable}`,
    `args: ${JSON.stringify(args)}`,
    `cwd: ${repoRoot}`,
    `status: ${result.status ?? "null"}`,
    `signal: ${result.signal ?? "null"}`,
    `error: ${result.error ? result.error.message : "null"}`,
    "",
    "--- stdout ---",
    typeof result.stdout === "string" ? result.stdout : (result.stdout?.toString("utf8") ?? ""),
    "",
    "--- stderr ---",
    typeof result.stderr === "string" ? result.stderr : (result.stderr?.toString("utf8") ?? ""),
  ].join("\n");
  writeFileSync(absoluteLogPath, log);
  return relativeLogPath;
}

function upsertReadinessValue(markdown: string, key: string, value: string): string {
  const re = new RegExp(`^- ${key}: .*$`, "mu");
  if (re.test(markdown)) return markdown.replace(re, `- ${key}: ${value}`);

  const lines = markdown.split("\n");
  const headingIndex = lines.findIndex((line) => /^###\s+Readiness Verdict\s*$/iu.test(line));
  if (headingIndex === -1) return markdown;
  let insertIndex = headingIndex + 1;
  while (insertIndex < lines.length && lines[insertIndex]?.trim() === "") insertIndex += 1;
  lines.splice(insertIndex, 0, `- ${key}: ${value}`);
  return lines.join("\n");
}

function updateGateLastResult(markdown: string, gate: string, result: string): string {
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const cells = line.trim().startsWith("|")
      ? line
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim())
      : [];
    if (cells[0] === gate && cells.length === 4) {
      lines[i] = `| ${cells[0]} | ${cells[1]} | ${cells[2]} | ${result} |`;
    }
  }
  return lines.join("\n");
}
