import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const RUNTIME_TYPECHECK_PARITY_TIMEOUT_MS = 60_000;
export const RUNTIME_TYPECHECK_PARITY_ROOT_SCOPE = "@parity/root";
export const RUNTIME_TYPECHECK_PARITY_WORKSPACE_SCOPE = "@parity/widget";
export const RUNTIME_TYPECHECK_PARITY_ROOT_FILE = "src/root.ts";
export const RUNTIME_TYPECHECK_PARITY_WORKSPACE_FILE = "packages/widget/src/widget.ts";

export type RuntimeTypecheckParityProbeOptions = {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly workspaceRoot?: string;
};

export type RuntimeTypecheckParityProbeResult = {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly helpOutput: string;
  readonly fileOutput: string;
  readonly expectedScopes: readonly string[];
  readonly workspaceRoot: string;
};

type ProbeExecutionResult = {
  readonly ok: boolean;
  readonly output: string;
  readonly detail?: string;
};

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function seedWorkspaceFixture(root: string): void {
  write(
    join(root, "package.json"),
    JSON.stringify({ name: RUNTIME_TYPECHECK_PARITY_ROOT_SCOPE, private: true }, null, 2) + "\n",
  );
  write(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  write(
    join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2022",
          strict: true,
          noEmit: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
  );
  write(join(root, RUNTIME_TYPECHECK_PARITY_ROOT_FILE), "export const rootValue = 1\n");

  write(
    join(root, "packages/widget/package.json"),
    JSON.stringify({ name: RUNTIME_TYPECHECK_PARITY_WORKSPACE_SCOPE, private: true }, null, 2) +
      "\n",
  );
  write(
    join(root, "packages/widget/tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2022",
          strict: true,
          noEmit: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
  );
  write(join(root, RUNTIME_TYPECHECK_PARITY_WORKSPACE_FILE), "export const widgetValue = 1\n");

  spawnSync("git", ["init", "-q"], {
    cwd: root,
    stdio: "ignore",
  });
}

function isSeededWorkspaceFixture(root: string): boolean {
  return (
    existsSync(join(root, "package.json")) &&
    existsSync(join(root, "pnpm-workspace.yaml")) &&
    existsSync(join(root, "tsconfig.json")) &&
    existsSync(join(root, RUNTIME_TYPECHECK_PARITY_ROOT_FILE)) &&
    existsSync(join(root, "packages/widget/package.json")) &&
    existsSync(join(root, "packages/widget/tsconfig.json")) &&
    existsSync(join(root, RUNTIME_TYPECHECK_PARITY_WORKSPACE_FILE))
  );
}

function ensureSeededWorkspaceFixture(root: string): void {
  if (isSeededWorkspaceFixture(root)) return;
  seedWorkspaceFixture(root);
}

export function formatResolvedTypecheckScopes(expectedScopes: readonly string[]): string {
  return `Resolved typecheck scopes: ${expectedScopes.join(", ")}`;
}

export function findTypecheckHelpSurfaceGaps(output: string): string[] {
  const gaps: string[] = [];
  if (!output.includes("--file")) {
    gaps.push("typecheck --help is missing the --file flag");
  }
  if (!output.includes("--package")) {
    gaps.push("typecheck --help is missing the --package flag");
  }
  return gaps;
}

export function findResolvedTypecheckScopeGaps(
  output: string,
  expectedScopes: readonly string[],
): string[] {
  const expectedLine = formatResolvedTypecheckScopes(expectedScopes);
  return output.includes(expectedLine)
    ? []
    : [`typecheck --file output is missing "${expectedLine}"`];
}

export function formatRuntimeTypecheckParityFailures(
  result: Pick<RuntimeTypecheckParityProbeResult, "failures">,
): string {
  return result.failures.join("; ");
}

function runParityCommand(
  options: RuntimeTypecheckParityProbeOptions,
  workspaceRoot: string,
  argv: readonly string[],
): ProbeExecutionResult {
  const result = spawnSync(options.command, argv, {
    cwd: workspaceRoot,
    env: options.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? RUNTIME_TYPECHECK_PARITY_TIMEOUT_MS,
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error) {
    return {
      ok: false,
      output,
      detail: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      output,
      detail: `exit ${result.status ?? 1}${output ? `: ${output.slice(0, 400)}` : ""}`,
    };
  }

  return { ok: true, output };
}

export function probeRuntimeTypecheckParity(
  options: RuntimeTypecheckParityProbeOptions,
): RuntimeTypecheckParityProbeResult {
  const expectedScopes = [
    RUNTIME_TYPECHECK_PARITY_ROOT_SCOPE,
    RUNTIME_TYPECHECK_PARITY_WORKSPACE_SCOPE,
  ] as const;
  const workspaceRoot =
    options.workspaceRoot ?? mkdtempSync(join(tmpdir(), "wp-runtime-typecheck-parity-"));
  const shouldCleanup = options.workspaceRoot === undefined;
  const baseArgs = [...(options.args ?? [])];

  try {
    ensureSeededWorkspaceFixture(workspaceRoot);

    const help = runParityCommand(options, workspaceRoot, [...baseArgs, "typecheck", "--help"]);
    const fileScope = runParityCommand(options, workspaceRoot, [
      ...baseArgs,
      "typecheck",
      "--file",
      RUNTIME_TYPECHECK_PARITY_ROOT_FILE,
      "--file",
      RUNTIME_TYPECHECK_PARITY_WORKSPACE_FILE,
    ]);

    const failures: string[] = [];
    if (!help.ok) {
      failures.push(`typecheck --help failed (${help.detail ?? "unknown error"})`);
    } else {
      failures.push(...findTypecheckHelpSurfaceGaps(help.output));
    }

    if (!fileScope.ok) {
      failures.push(`typecheck --file failed (${fileScope.detail ?? "unknown error"})`);
    } else {
      failures.push(...findResolvedTypecheckScopeGaps(fileScope.output, expectedScopes));
    }

    return {
      ok: failures.length === 0,
      failures,
      helpOutput: help.output,
      fileOutput: fileScope.output,
      expectedScopes,
      workspaceRoot,
    };
  } finally {
    if (shouldCleanup) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  }
}
