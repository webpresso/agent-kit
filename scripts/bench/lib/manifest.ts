import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type Manifest = {
  bun: string;
  claude: string;
  node: string;
  model: string;
  plugins: {
    main: string;
    v1: string;
    v2: string;
  };
};

export type WorkspaceMode = "isolated" | "single-workspace";
export type BenchAuthMode = "api-key" | "claude-login";

export type WorkspaceConfig = {
  mode: WorkspaceMode;
  cacheDisclaimer: string | null;
  keyEnvNames: string[];
  authMode: BenchAuthMode;
  adminVerification: "required-for-proof" | "operator-asserted" | "not-applicable";
};

export type WorkspaceIdentity = {
  workspaceId: string;
  apiKeyEnv: string;
};

export type WorkspaceLookup = (adminKey: string) => Promise<string[]>;

export type VersionRunner = (command: string, args: string[]) => Promise<string>;

export type ManifestVerificationMode = "strict" | "dry-run-current-checkout";

export type VerifyManifestOptions = {
  mode?: ManifestVerificationMode;
};

export type CaptureOptions = {
  pluginDirs?: {
    main: string;
    v1: string;
    v2: string;
  };
  model?: string;
  runCommand?: VersionRunner;
  runPluginSha?: (path: string) => Promise<string>;
};

const DEFAULT_MODEL = process.env.BENCH_MODEL ?? "unknown";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ISOLATED_KEY_ENVS = [
  "ANTHROPIC_API_KEY_BASELINE",
  "ANTHROPIC_API_KEY_V1",
  "ANTHROPIC_API_KEY_V2",
] as const;
const SINGLE_WORKSPACE_KEY_ENVS = ["ANTHROPIC_API_KEY"] as const;
const ISOLATED_WORKSPACE_ID_ENVS = [
  "ANTHROPIC_WORKSPACE_ID_BASELINE",
  "ANTHROPIC_WORKSPACE_ID_V1",
  "ANTHROPIC_WORKSPACE_ID_V2",
] as const;

function defaultPluginDirs(): { main: string; v1: string; v2: string } {
  return {
    main: process.env.BENCH_PLUGIN_MAIN ?? REPO_ROOT,
    v1: process.env.BENCH_PLUGIN_V1 ?? REPO_ROOT,
    v2: process.env.BENCH_PLUGIN_V2 ?? REPO_ROOT,
  };
}

function parseVersion(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty command output");
  }
  return trimmed;
}

async function runWithBun(command: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const status = await proc.exited;
  const stdout = await stdoutPromise;
  const stderr = await stderrPromise;

  if (status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr.trim()}`);
  }

  return parseVersion(stdout);
}

async function runWithNode(command: string, args: string[]): Promise<string> {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const details = result.stderr ?? "";
    throw new Error(`${command} ${args.join(" ")} failed: ${String(details).trim()}`);
  }

  return parseVersion(String(result.stdout ?? ""));
}

async function runCommand(command: string, args: string[]): Promise<string> {
  if (typeof Bun !== "undefined" && typeof Bun.spawn === "function") {
    return runWithBun(command, args);
  }
  return runWithNode(command, args);
}

async function runPluginSha(path: string): Promise<string> {
  const raw = await runCommand("git", ["-C", path, "rev-parse", "HEAD"]);
  return raw;
}

export async function captureManifest(options: CaptureOptions = {}): Promise<Manifest> {
  const run = options.runCommand ?? runCommand;
  const pluginDirs = options.pluginDirs ?? defaultPluginDirs();
  const runPlugin = options.runPluginSha ?? runPluginSha;
  const [bun, claude, node, main, v1, v2] = await Promise.all([
    run("bun", ["--version"]),
    run("claude", ["--version"]),
    run("node", ["--version"]),
    runPlugin(pluginDirs.main),
    runPlugin(pluginDirs.v1),
    runPlugin(pluginDirs.v2),
  ]);

  return {
    bun,
    claude,
    node,
    model: options.model ?? DEFAULT_MODEL,
    plugins: {
      main,
      v1,
      v2,
    },
  };
}

export function diffManifest(captured: Manifest, pinned: Manifest): string[] {
  const diffs: string[] = [];

  if (captured.bun !== pinned.bun) {
    diffs.push(`bun: captured=${captured.bun} pinned=${pinned.bun}`);
  }

  if (captured.claude !== pinned.claude) {
    diffs.push(`claude: captured=${captured.claude} pinned=${pinned.claude}`);
  }

  if (captured.node !== pinned.node) {
    diffs.push(`node: captured=${captured.node} pinned=${pinned.node}`);
  }

  if (captured.model !== pinned.model) {
    diffs.push(`model: captured=${captured.model} pinned=${pinned.model}`);
  }

  const pluginKeys: Array<keyof Manifest["plugins"]> = ["main", "v1", "v2"];
  for (const key of pluginKeys) {
    if (captured.plugins[key] !== pinned.plugins[key]) {
      diffs.push(`plugins.${key}: captured=${captured.plugins[key]} pinned=${pinned.plugins[key]}`);
    }
  }

  return diffs;
}

function isGitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

function validateDryRunPluginRefs(captured: Manifest, pinned: Manifest): string[] {
  const diffs: string[] = [];
  const pluginKeys: Array<keyof Manifest["plugins"]> = ["main", "v1", "v2"];
  for (const key of pluginKeys) {
    if (!isGitSha(captured.plugins[key]) || !isGitSha(pinned.plugins[key])) {
      diffs.push(
        `plugins.${key}: dry-run requires captured and pinned git SHAs; captured=${captured.plugins[key]} pinned=${pinned.plugins[key]}`,
      );
    }
  }
  return diffs;
}

function diffManifestForMode(
  captured: Manifest,
  pinned: Manifest,
  mode: ManifestVerificationMode,
): string[] {
  if (mode === "strict") {
    return diffManifest(captured, pinned);
  }

  const strictDiffs = diffManifest(captured, pinned);
  const nonPluginDiffs = strictDiffs.filter((diff) => !diff.startsWith("plugins."));
  return [...nonPluginDiffs, ...validateDryRunPluginRefs(captured, pinned)];
}

export function verifyManifest(
  captured: Manifest,
  pinned: Manifest,
  options: VerifyManifestOptions = {},
): void {
  const diffs = diffManifestForMode(captured, pinned, options.mode ?? "strict");
  if (diffs.length > 0) {
    throw new Error(`Manifest mismatch\n${diffs.join("\n")}`);
  }
}

export function loadManifest(
  lockPath = resolve(REPO_ROOT, "scripts/bench/manifest.lock.json"),
): Manifest {
  const raw = readFileSync(lockPath, "utf8");
  const parsed = JSON.parse(raw) as Manifest;
  return {
    bun: String(parsed.bun),
    claude: String(parsed.claude),
    node: String(parsed.node),
    model: String(parsed.model),
    plugins: {
      main: String(parsed.plugins.main),
      v1: String(parsed.plugins.v1),
      v2: String(parsed.plugins.v2),
    },
  };
}

export function resolveWorkspaceConfig(env: NodeJS.ProcessEnv = process.env): WorkspaceConfig {
  const mode = env.BENCH_WORKSPACE_MODE;
  if (mode !== "isolated" && mode !== "single-workspace") {
    throw new Error(
      "Workspace mode unspecified. Set BENCH_WORKSPACE_MODE=isolated or BENCH_WORKSPACE_MODE=single-workspace.",
    );
  }

  if (mode === "isolated") {
    const hasAdminKey =
      typeof env.ANTHROPIC_ADMIN_KEY === "string" && env.ANTHROPIC_ADMIN_KEY.length > 0;
    return {
      mode,
      cacheDisclaimer: hasAdminKey
        ? null
        : "operator-asserted workspace isolation: distinct Anthropic workspace IDs supplied, but not admin-verified.",
      keyEnvNames: [...ISOLATED_KEY_ENVS],
      authMode: "api-key",
      adminVerification: hasAdminKey ? "required-for-proof" : "operator-asserted",
    };
  }

  if (env.BENCH_AUTH_MODE === "claude-login") {
    return {
      mode,
      cacheDisclaimer:
        "cache-disabled baseline: single-workspace mode uses local Claude CLI login and cannot claim clean cross-variant cache isolation.",
      keyEnvNames: [],
      authMode: "claude-login",
      adminVerification: "not-applicable",
    };
  }

  return {
    mode,
    cacheDisclaimer:
      "cache-disabled baseline: single-workspace mode cannot claim clean cross-variant cache isolation.",
    keyEnvNames: [...SINGLE_WORKSPACE_KEY_ENVS],
    authMode: "api-key",
    adminVerification: "not-applicable",
  };
}

export function validateWorkspaceKeyPresence(
  config: WorkspaceConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing = config.keyEnvNames.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing workspace API keys: ${missing.join(", ")}`);
  }
}

export function validateDistinctWorkspaces(identities: WorkspaceIdentity[]): void {
  const ids = identities.map((identity) => identity.workspaceId);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error("Isolated mode requires distinct Anthropic workspaces for each variant key.");
  }
}

export function resolveWorkspaceIdentitiesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WorkspaceIdentity[] {
  const config = resolveWorkspaceConfig(env);
  if (config.mode !== "isolated") {
    return [];
  }

  const identities = ISOLATED_WORKSPACE_ID_ENVS.map((workspaceEnv, index) => {
    const workspaceId = env[workspaceEnv];
    const apiKeyEnv = ISOLATED_KEY_ENVS[index];
    if (!workspaceId || !apiKeyEnv) {
      throw new Error(
        "Isolated mode requires ANTHROPIC_WORKSPACE_ID_BASELINE, ANTHROPIC_WORKSPACE_ID_V1, and ANTHROPIC_WORKSPACE_ID_V2.",
      );
    }

    return {
      workspaceId,
      apiKeyEnv,
    };
  });

  validateDistinctWorkspaces(identities);
  return identities;
}

export async function listAnthropicWorkspaceIds(adminKey: string): Promise<string[]> {
  const response = await fetch("https://api.anthropic.com/v1/organizations/workspaces", {
    headers: {
      "x-api-key": adminKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    throw new Error(`Anthropic workspace lookup failed: ${response.status}`);
  }

  const parsed = (await response.json()) as {
    data?: Array<{ id?: unknown }>;
  };

  return (parsed.data ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function validateKnownAnthropicWorkspaces(
  identities: WorkspaceIdentity[],
  adminKey: string,
  lookup: WorkspaceLookup = listAnthropicWorkspaceIds,
): Promise<void> {
  const known = new Set(await lookup(adminKey));
  const missing = identities
    .map((identity) => identity.workspaceId)
    .filter((workspaceId) => !known.has(workspaceId));

  if (missing.length > 0) {
    throw new Error(`Unknown Anthropic workspace IDs: ${missing.join(", ")}`);
  }
}
