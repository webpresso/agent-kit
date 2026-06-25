import type { CAC } from "cac";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createDeployPlan, runDeployPlan } from "#deploy/run.js";
import { createWpError, ensureWpError, formatWpError, toWpErrorJson } from "#errors/wp-error.js";
import { parseSecretOrchestrationConfig } from "#secrets/config/schema.js";
import { resolveSecretSink } from "#secrets/sinks/planner.js";

export interface PreviewCommandOptions {
  readonly cwd?: string;
  readonly lane?: string;
  readonly json?: boolean;
  readonly execute?: boolean;
}

export interface PreviewCommandDeps {
  readonly stdout?: Pick<NodeJS.WriteStream, "write">;
  readonly stderr?: Pick<NodeJS.WriteStream, "write">;
  readonly createPlan?: typeof createDeployPlan;
  readonly runPlan?: typeof runDeployPlan;
}

export function registerPreviewCommand(cli: CAC): void {
  cli
    .command(
      "preview",
      "Plan or run a preview deploy through the shared secret orchestration surface",
    )
    .option("--lane <lane>", "Preview lane id", { default: "preview_main" })
    .option("--json", "Emit machine-readable JSON")
    .option("--execute", "Run the preview deploy instead of dry-run planning")
    .action((flags: Record<string, unknown>) =>
      runPreviewCommand({
        cwd: process.cwd(),
        lane: flags.lane as string | undefined,
        json: Boolean(flags.json),
        execute: Boolean(flags.execute),
      }),
    );
}

export async function runPreviewCommand(
  options: PreviewCommandOptions = {},
  deps: PreviewCommandDeps = {},
): Promise<number> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const configPath = join(cwd, ".webpresso", "secrets.config.json");
    if (!existsSync(configPath)) {
      throw createWpError({
        code: "WP_PREVIEW_CONFIG_MISSING",
        problem: "Missing .webpresso/secrets.config.json.",
      });
    }
    const config = parseSecretOrchestrationConfig(JSON.parse(readFileSync(configPath, "utf8")));
    const sinkPlan = resolveSecretSink({
      config,
      sink: "deploy-wrangler",
      profile: "preview",
      op: "preview",
    });
    const lane = options.lane ?? "preview_main";
    if (!/^preview_main$|^preview_pr_\d+$/u.test(lane)) {
      throw createWpError({
        code: "WP_PREVIEW_INVALID_LANE",
        problem: `Invalid preview lane "${lane}".`,
        fix: "Use preview_main or preview_pr_<n>.",
        docsPath: "docs/guides/repo-to-preview-url.md",
      });
    }

    if (!options.execute) {
      const deployPlan = await (deps.createPlan ?? createDeployPlan)({
        cwd,
        lane,
        dryRun: true,
      });
      const payload = { ok: true, code: "WP_PREVIEW_PLAN_READY", sinkPlan, deployPlan };
      (deps.stdout ?? process.stdout).write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    return await (deps.runPlan ?? runDeployPlan)({
      cwd,
      lane,
      dryRun: false,
      planJson: Boolean(options.json),
    });
  } catch (error) {
    const wpError = ensureWpError(error, {
      code: "WP_PREVIEW_FAILED",
      docsPath: "docs/guides/repo-to-preview-url.md",
    });
    const writer = deps.stderr ?? process.stderr;
    if (options.json) writer.write(`${JSON.stringify(toWpErrorJson(wpError), null, 2)}\n`);
    else writer.write(`${formatWpError(wpError)}\n`);
    return 1;
  }
}
