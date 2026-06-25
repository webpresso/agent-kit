import type { CAC } from "cac";
import type { SecretGateCommandOptions, SecretGateRunResult } from "#secret-gate/runner.js";

import {
  buildPublicCiActCommand,
  resolveCiActExecutionMode,
  sanitizePublicCiActArgv,
  type CiActEventName,
  type CiActExecutionMode,
} from "#ci/act-runner.js";
import { redactText } from "#mcp/tools/_shared/redact.js";
import { runSecretGateCommand } from "#secret-gate/runner.js";

export const DEFAULT_CI_ACT_TIMEOUT_MS = 20 * 60_000;
export const MAX_CI_ACT_TIMEOUT_MS = 60 * 60_000;

export const CI_COMMAND_HELP = [
  "Run repository CI helpers through the portable, secret-safe wp surface.",
  "Configure secret access with committed `.webpresso/secrets.config.json` metadata and validate with `wp secrets doctor --profile <profile> --json` before execution.",
  "",
  "Examples:",
  "  wp ci act --workflow ci-e2e",
  "  wp ci act --workflow ci-e2e --execute",
  "  wp ci act --workflow-path .github/workflows/ci.yml --job test",
].join("\n");

export interface CiActOptions {
  readonly workflow?: string;
  readonly workflowPath?: string;
  readonly job?: string;
  readonly eventName?: CiActEventName;
  readonly eventPath?: string;
  readonly envProfile?: string;
  readonly secretProfile?: string;
  readonly mode?: CiActExecutionMode;
  readonly containerArchitecture?: string;
  readonly platformImage?: string;
  readonly execute?: boolean;
  readonly timeoutMs?: number;
}

export interface CiCommandConfig {
  readonly command: string;
  readonly args: readonly string[];
}

export interface CiCommandDeps {
  readonly cwd?: string;
  readonly run?: (options: SecretGateCommandOptions) => Promise<SecretGateRunResult>;
  readonly stdout?: Pick<NodeJS.WriteStream, "write">;
  readonly stderr?: Pick<NodeJS.WriteStream, "write">;
}

export function registerCiCommand(cli: CAC): void {
  cli
    .command("ci <action>", CI_COMMAND_HELP)
    .option("--workflow <id>", "Workflow id or path; bare ids resolve under .github/workflows/", {
      default: "ci-e2e",
    })
    .option("--workflow-path <path>", "Explicit workflow file path")
    .option("--job <id>", "Workflow job id")
    .option("--event-name <name>", "act event name: pull_request | push | workflow_dispatch")
    .option("--event-path <path>", "Use an existing event JSON file")
    .option("--env-profile <profile>", "Secret-gate runtime profile", { default: "secrets-only" })
    .option(
      "--secret-profile <profile>",
      "Repo-owned secret profile from .webpresso/secrets.config.json",
    )
    .option("--mode <mode>", "ci act mode: direct | replay")
    .option("--container-architecture <arch>", "act container architecture override")
    .option("--platform-image <image>", "act runner image for ubicloud-standard-2")
    .option(
      "--timeout-ms <ms>",
      `act execution timeout in milliseconds (default: ${DEFAULT_CI_ACT_TIMEOUT_MS})`,
    )
    .option("--execute", "Run act; default is a redacted dry-run preview")
    .option("--dry-run", "Print the resolved command without executing it")
    .action((action: string, flags: Record<string, unknown>) => {
      if (action !== "act") {
        process.stderr.write(`Unknown ci action: ${action}. Use 'act'.\n`);
        return 1;
      }

      return runCiActCommand({
        workflow: flags.workflow as string | undefined,
        workflowPath: flags.workflowPath as string | undefined,
        job: flags.job as string | undefined,
        eventName: flags.eventName as CiActEventName | undefined,
        envProfile: flags.envProfile as string | undefined,
        secretProfile: flags.secretProfile as string | undefined,
        mode: flags.mode as CiActExecutionMode | undefined,
        containerArchitecture: flags.containerArchitecture as string | undefined,
        platformImage: flags.platformImage as string | undefined,
        eventPath: flags.eventPath as string | undefined,
        execute: Boolean(flags.execute) && !flags.dryRun,
        timeoutMs: parseCiActTimeoutMs(flags.timeoutMs),
      });
    });
}

export function buildCiActCommand(
  options: CiActOptions = {},
  cwd = process.cwd(),
): CiCommandConfig {
  const command = buildPublicCiActCommand({ ...options, cwd });
  return { command: command.command, args: command.args };
}

export function validateCiActCommand(..._legacyArgs: readonly unknown[]): string | null {
  return null;
}

export async function runCiActCommand(
  options: CiActOptions = {},
  deps: CiCommandDeps = {},
): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const command = buildPublicCiActCommand({ ...options, cwd });

  if (!options.execute) {
    const preview = sanitizePublicCiActArgv(command);
    (deps.stdout ?? process.stdout).write(
      `${JSON.stringify({ command: preview.command, args: preview.args })}\n`,
    );
    return 0;
  }

  if (resolveCiActExecutionMode(options) === "replay") {
    (deps.stderr ?? process.stderr).write(
      "Warning: replay mode is a generated local approximation and is not security-equivalent to GitHub CI or OIDC.\n",
    );
  }

  const result = await (deps.run ?? runSecretGateCommand)({
    cwd,
    envProfile: "none",
    command: command.command,
    args: command.args,
    timeoutMs: normalizeCiActTimeoutMs(options.timeoutMs),
  });
  const stdout = redactText(result.stdout) ?? "";
  const stderr = redactText(result.stderr) ?? "";
  if (stdout) (deps.stdout ?? process.stdout).write(stdout);
  if (stderr) (deps.stderr ?? process.stderr).write(stderr);
  return result.exitCode;
}

export function normalizeCiActTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_CI_ACT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  if (timeoutMs > MAX_CI_ACT_TIMEOUT_MS) {
    throw new Error(`--timeout-ms must be <= ${MAX_CI_ACT_TIMEOUT_MS}`);
  }
  return timeoutMs;
}

export function parseCiActTimeoutMs(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return normalizeCiActTimeoutMs(parsed);
}
