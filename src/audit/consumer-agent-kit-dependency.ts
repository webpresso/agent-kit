import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import yaml from "js-yaml";

import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";

const PACKAGE_JSON_PATH = "package.json";
const PNPM_WORKSPACE_PATH = "pnpm-workspace.yaml";
const PACKAGE_NAME = "@webpresso/agent-kit";
const LOCAL_SETUP_ACTION_PATH = ".github/actions/setup-webpresso/action.yml";
const LOCAL_SETUP_MONOREPO_ACTION_PATH = ".github/actions/setup-monorepo/action.yml";
const LOCAL_VERSION_HELPER_PATH = "scripts/resolve-webpresso-cli-versions.js";
const WORKFLOW_DIR = ".github/workflows";

const STALE_REUSABLE_CALLER_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly message: string;
}> = [
  {
    pattern: /\bskip_when_ci_secret_missing\s*:/u,
    message:
      "consumer reusable-workflow caller must not pass skip_when_ci_secret_missing; the shared workflow contract no longer supports that fallback",
  },
  {
    pattern: /\bDOPPLER_(?:PREVIEW_|SERVICE_)?TOKEN\b/u,
    message:
      "consumer workflow must not depend on long-lived Doppler token secrets; use OIDC/shared workflow bootstrap or direct runtime secrets instead",
  },
];

function readPackageJson(rootDirectory: string): Record<string, unknown> | null {
  const path = join(rootDirectory, PACKAGE_JSON_PATH);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) =>
      typeof entryValue === "string" ? [[key, entryValue] as const] : [],
    ),
  );
}

function hasRecordKey(value: unknown, key: string): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readWorkspaceYaml(rootDirectory: string): Record<string, unknown> | null {
  const path = join(rootDirectory, PNPM_WORKSPACE_PATH);
  if (!existsSync(path)) return null;
  try {
    const parsed = yaml.load(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function auditConsumerAgentKitDependency(
  rootDirectory: string = process.cwd(),
): RepoAuditResult {
  const packageJson = readPackageJson(rootDirectory);
  if (!packageJson) {
    return {
      ok: true,
      title: "consumer-agent-kit-dependency",
      checked: 0,
      violations: [],
    };
  }

  if (packageJson.name === PACKAGE_NAME) {
    return {
      ok: true,
      title: "consumer-agent-kit-dependency",
      checked: 4,
      violations: [],
    };
  }

  const dependencies = readStringRecord(packageJson.dependencies);
  const devDependencies = readStringRecord(packageJson.devDependencies);
  const workspaceYaml = readWorkspaceYaml(rootDirectory);
  const violations: RepoAuditViolation[] = [];

  if (typeof dependencies[PACKAGE_NAME] === "string") {
    violations.push({
      file: PACKAGE_JSON_PATH,
      message:
        `consumer package must not depend on ${PACKAGE_NAME} in dependencies; ` +
        "use the global wp CLI / MCP surfaces instead",
    });
  }

  if (typeof devDependencies[PACKAGE_NAME] === "string") {
    violations.push({
      file: PACKAGE_JSON_PATH,
      message:
        `consumer package must not depend on ${PACKAGE_NAME} in devDependencies; ` +
        "use the global wp CLI / MCP surfaces instead",
    });
  }

  const workspaceCatalog = readStringRecord(workspaceYaml?.catalog);
  if (typeof workspaceCatalog[PACKAGE_NAME] === "string") {
    violations.push({
      file: PNPM_WORKSPACE_PATH,
      message:
        `consumer repo must not pin ${PACKAGE_NAME} in pnpm-workspace catalog; ` +
        "depend on @webpresso/agent-config locally and use the global wp runtime instead",
    });
  }

  if (hasRecordKey(workspaceYaml?.allowBuilds, PACKAGE_NAME)) {
    violations.push({
      file: PNPM_WORKSPACE_PATH,
      message:
        `consumer repo must not keep ${PACKAGE_NAME} in allowBuilds; ` +
        "remove stale agent-kit workspace ownership metadata",
    });
  }

  if (existsSync(join(rootDirectory, LOCAL_SETUP_ACTION_PATH))) {
    violations.push({
      file: LOCAL_SETUP_ACTION_PATH,
      message:
        "consumer repo must not keep the local setup-webpresso GitHub action; use shared wp/global setup ownership instead",
    });
  }

  if (existsSync(join(rootDirectory, LOCAL_SETUP_MONOREPO_ACTION_PATH))) {
    violations.push({
      file: LOCAL_SETUP_MONOREPO_ACTION_PATH,
      message:
        "consumer repo must not keep the local setup-monorepo GitHub action; use shared wp/global setup ownership instead",
    });
  }

  if (existsSync(join(rootDirectory, LOCAL_VERSION_HELPER_PATH))) {
    violations.push({
      file: LOCAL_VERSION_HELPER_PATH,
      message:
        "consumer repo must not keep resolve-webpresso-cli-versions.js; local setup-webpresso ownership is retired",
    });
  }

  const workflowRoot = join(rootDirectory, WORKFLOW_DIR);
  if (existsSync(workflowRoot)) {
    for (const entry of readDirSafe(workflowRoot)) {
      if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
      const relativePath = `${WORKFLOW_DIR}/${entry}`;
      const content = readFileSync(join(workflowRoot, entry), "utf8");
      for (const { pattern, message } of STALE_REUSABLE_CALLER_PATTERNS) {
        if (pattern.test(content)) {
          violations.push({ file: relativePath, message: `${relativePath}: ${message}` });
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    title: "consumer-agent-kit-dependency",
    checked: 4,
    violations,
  };
}

function readDirSafe(directory: string): string[] {
  try {
    return readdirSync(directory, "utf8");
  } catch {
    return [];
  }
}
