import { resolve } from "node:path";

import { buildSecretGateCommand, type SecretGateCommand } from "#secret-gate/runner.js";
import { resolveSecretsConfigProfileEnvironment } from "#runtime/secrets-config.js";
import {
  createReplayWorkflow,
  GENERATED_REPLAY_WORKFLOW_PLACEHOLDER,
  type CiActReplayWorkflow,
} from "./act-replay.js";
export { GENERATED_REPLAY_WORKFLOW_PLACEHOLDER } from "./act-replay.js";

export type CiActEventName = "pull_request" | "push" | "workflow_dispatch";
export type CiActExecutionMode = "direct" | "replay";

export interface PublicCiActOptions {
  readonly cwd?: string;
  readonly workflow?: string;
  readonly workflowPath?: string;
  readonly job?: string;
  readonly eventName?: CiActEventName;
  readonly eventPath?: string;
  readonly envProfile?: string;
  readonly secretEnvProfile?: string;
  readonly secretProfile?: string;
  readonly mode?: CiActExecutionMode;
  readonly containerArchitecture?: string;
  readonly platformImage?: string;
  readonly execute?: boolean;
}

export interface PublicCiActCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly actArgs: readonly string[];
}

export interface PreparedPublicCiActExecution {
  readonly command: PublicCiActCommand;
  readonly mode: CiActExecutionMode;
  readonly nonSecurityEquivalent: boolean;
  cleanup(): void;
}

const DEFAULT_WORKFLOW = "ci-e2e";

export const DEFAULT_PLATFORM_IMAGE = "ghcr.io/catthehacker/ubuntu:full-latest";
const DEFAULT_PLATFORM_IMAGE_SUPPORTED_ARCHITECTURES = new Set(["linux/amd64", "linux/arm64"]);

export function resolveDefaultContainerArchitecture(
  platform = process.platform,
  arch = process.arch,
): string {
  return platform === "darwin" && arch === "arm64" ? "linux/arm64" : "linux/amd64";
}

export function assertSupportedDefaultPlatformImageArchitecture(
  platformImage: string,
  containerArchitecture: string,
): void {
  if (platformImage !== DEFAULT_PLATFORM_IMAGE) {
    return;
  }

  if (DEFAULT_PLATFORM_IMAGE_SUPPORTED_ARCHITECTURES.has(containerArchitecture)) {
    return;
  }

  throw new Error(
    `Unsupported container architecture "${containerArchitecture}" for default act image ${DEFAULT_PLATFORM_IMAGE}. Supported architectures: linux/amd64, linux/arm64.`,
  );
}

export function resolveCiActWorkflowPath(options: PublicCiActOptions = {}): string {
  if (options.workflowPath && options.workflowPath.trim().length > 0) return options.workflowPath;
  const workflow = (options.workflow ?? DEFAULT_WORKFLOW).trim();
  if (workflow.includes("/") || workflow.endsWith(".yml") || workflow.endsWith(".yaml"))
    return workflow;
  return `.github/workflows/${workflow}.yml`;
}

export function resolveCiActExecutionMode(options: PublicCiActOptions = {}): CiActExecutionMode {
  return options.mode === "replay" ? "replay" : "direct";
}

export function buildPublicCiActArgs(
  options: PublicCiActOptions = {},
  workflowPathOverride?: string,
): string[] {
  const cwd = options.cwd ?? process.cwd();
  const platformImage = options.platformImage ?? DEFAULT_PLATFORM_IMAGE;
  const containerArchitecture =
    options.containerArchitecture ?? resolveDefaultContainerArchitecture();

  assertSupportedDefaultPlatformImageArchitecture(platformImage, containerArchitecture);

  const args = [
    options.eventName ?? "pull_request",
    "-W",
    workflowPathOverride ?? resolve(cwd, resolveCiActWorkflowPath(options)),
    "-P",
    `ubicloud-standard-2=${platformImage}`,
    "--rm",
  ];

  pushOption(args, "-j", options.job);
  pushOption(args, "-e", options.eventPath ? resolve(cwd, options.eventPath) : undefined);
  pushOption(args, "--container-architecture", containerArchitecture);
  return args;
}

export function buildPublicCiActCommand(options: PublicCiActOptions = {}): PublicCiActCommand {
  const workflowPathOverride =
    resolveCiActExecutionMode(options) === "replay"
      ? GENERATED_REPLAY_WORKFLOW_PLACEHOLDER
      : undefined;
  const actArgs = buildPublicCiActArgs(options, workflowPathOverride);
  const secretEnvProfile = resolveCiActSecretEnvProfile(options) ?? "preview";
  const wrapped: SecretGateCommand = buildSecretGateCommand({
    sink: "act",
    profile: secretEnvProfile,
    envProfile: options.envProfile ?? "secrets-only",
    forceSecretGate: true,
    command: "act",
    args: actArgs,
  });
  return { command: wrapped.command, args: wrapped.args, actArgs };
}

export function preparePublicCiActExecution(
  options: PublicCiActOptions = {},
): PreparedPublicCiActExecution {
  const cwd = options.cwd ?? process.cwd();
  const mode = resolveCiActExecutionMode(options);
  const replay: CiActReplayWorkflow | null =
    mode === "replay"
      ? createReplayWorkflow({
          cwd,
          workflowPath: resolveCiActWorkflowPath(options),
          eventName: options.eventName ?? "pull_request",
        })
      : null;

  const actArgs = buildPublicCiActArgs(
    { ...options, cwd },
    replay ? replay.workflowPath : undefined,
  );
  const secretEnvProfile = resolveCiActSecretEnvProfile({ ...options, cwd }) ?? "preview";
  const wrapped: SecretGateCommand = buildSecretGateCommand({
    sink: "act",
    profile: secretEnvProfile,
    envProfile: options.envProfile ?? "secrets-only",
    forceSecretGate: true,
    command: "act",
    args: actArgs,
  });

  return {
    command: { command: wrapped.command, args: wrapped.args, actArgs },
    mode,
    nonSecurityEquivalent: mode === "replay",
    cleanup() {
      replay?.cleanup();
    },
  };
}

export function resolveCiActSecretEnvProfile(options: PublicCiActOptions = {}): string | undefined {
  const secretEnvProfile = options.secretEnvProfile?.trim();
  if (secretEnvProfile) {
    return secretEnvProfile;
  }

  const secretProfile = options.secretProfile?.trim();
  if (secretProfile) {
    return resolveSecretsConfigProfileEnvironment(secretProfile, options.cwd);
  }
  return undefined;
}

export function sanitizePublicCiActArgv(command: PublicCiActCommand): PublicCiActCommand {
  return {
    command: command.command,
    args: command.args.map(sanitizeArg),
    actArgs: command.actArgs.map(sanitizeArg),
  };
}

export function assertNoForbiddenCiActArgs(args: readonly string[]): void {
  const forbidden = [
    "--chef-token",
    "--secret",
    "-s",
    "--secret-file",
    "--env-file",
    "--bind",
    "--volume",
    "-v",
    "--container-options",
  ];
  const found = args.find(
    (arg) => forbidden.includes(arg) || forbidden.some((flag) => arg.startsWith(`${flag}=`)),
  );
  if (found) throw new Error(`Unsupported unsafe ci act argument: ${found}`);
}

function pushOption(args: string[], flag: string, value: string | number | undefined): void {
  if (value === undefined || value === "") return;
  args.push(flag, String(value));
}

function sanitizeArg(value: string): string {
  if (/wp-ci-act-[^/\\]+[/\\]secrets\.env$/u.test(value)) return "[INTERNAL_SECRET_FILE]";
  if (/wp-ci-act-replay-[^/\\]+[/\\]workflow\.yml$/u.test(value)) {
    return GENERATED_REPLAY_WORKFLOW_PLACEHOLDER;
  }
  return value;
}
