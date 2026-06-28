import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export const DEFAULT_SESSION_MEMORY_THRESHOLDS = {
    postToolCaptureLatencyMs: 750,
    precompactSnapshotLatencyMs: 1000,
    startupResumeInjectionLatencyMs: 750,
    searchQualityRecallAt5: 0.8,
};
const DEFAULT_VARIANTS = ["baseline", "v1", "v2"];
const DEFAULT_MODEL = "claude-sonnet-4-5";
const BENCH_RUNTIME_MODULE_PATHS = [
    ["scripts", "bench", "lib", "manifest.ts"],
    ["scripts", "bench", "scenarios", "_schema.ts"],
    ["scripts", "bench", "lib", "cost-aggregator.ts"],
    ["scripts", "bench", "lib", "variant-runner.ts"],
    ["scripts", "bench", "lib", "report-writer.ts"],
    ["scripts", "bench", "lib", "transcript-scorer.ts"],
    ["scripts", "bench", "lib", "measurement-artifact.ts"],
];
export function isBunSingleFileUrl(fromUrl) {
    return fromUrl.startsWith("file:///$bunfs/root") || fromUrl.startsWith("file:///__bunfs__/root");
}
export function resolveRepoRoot(fromUrl, fallbackRoot = process.cwd()) {
    let current = isBunSingleFileUrl(fromUrl) ? fallbackRoot : dirname(fileURLToPath(fromUrl));
    while (true) {
        if (existsSync(resolve(current, "package.json"))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            throw new Error(`Unable to resolve repo root from ${fromUrl}`);
        }
        current = parent;
    }
}
export function assertBenchRuntimeAssets(repoRoot) {
    const packageJsonPath = resolve(repoRoot, "package.json");
    let packageName = null;
    try {
        packageName = JSON.parse(readFileSync(packageJsonPath, "utf8"))?.name;
    }
    catch {
        packageName = null;
    }
    if (packageName !== "@webpresso/agent-kit") {
        throw new Error([
            "wp bench session-memory refuses to load benchmark assets from a non-agent-kit package root.",
            `Resolved package root: ${repoRoot}.`,
            `Expected package.json#name to be @webpresso/agent-kit, found ${String(packageName)}.`,
            "Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available.",
        ].join(" "));
    }
    const missing = BENCH_RUNTIME_MODULE_PATHS.map((parts) => resolve(repoRoot, ...parts)).filter((candidate) => !existsSync(candidate));
    if (missing.length === 0)
        return;
    throw new Error([
        "wp bench session-memory requires bench source assets that are not available in this runtime context.",
        `Resolved package root: ${repoRoot}.`,
        `Missing required asset: ${missing[0]}.`,
        "Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available; the compiled runtime supports `wp bench --help` but does not silently load benchmark assets from the caller project.",
    ].join(" "));
}
export function resolveBenchRuntimeRoot(fromUrl = import.meta.url, fallbackRoot = process.cwd()) {
    if (isBunSingleFileUrl(fromUrl)) {
        throw new Error([
            "wp bench session-memory is not available from the compiled single-file runtime because benchmark assets are source-only.",
            "The compiled runtime supports `wp bench --help` and `wp bench session-memory --help`, but refuses to resolve benchmark assets from the caller cwd.",
            "Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available.",
        ].join(" "));
    }
    const repoRoot = resolveRepoRoot(fromUrl, fallbackRoot);
    assertBenchRuntimeAssets(repoRoot);
    return repoRoot;
}
export function assertBenchSessionMemorySupportedRuntime(env = process.env) {
    if (env.WP_COMPILED_RUNTIME !== "1")
        return;
    throw new Error([
        "wp bench session-memory is not available from the compiled runtime because benchmark assets are source-only.",
        "The compiled runtime supports `wp bench --help` and `wp bench session-memory --help`, but refuses to execute source-dependent benchmark assets.",
        "Run this benchmark from an @webpresso/agent-kit source checkout or built JS install with bench assets available.",
    ].join(" "));
}
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, inner]) => `${JSON.stringify(key)}:${stableStringify(inner)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value);
}
export function createManifestDigest(manifest) {
    return createHash("sha256").update(stableStringify(manifest)).digest("hex").slice(0, 12);
}
export function createRunId(manifest, clock = Date.now) {
    const digest = createManifestDigest(manifest);
    return `${digest}-${clock().toString(36)}`;
}
function normalizeTrials(input) {
    if (typeof input.trials === "number" && Number.isFinite(input.trials) && input.trials > 0) {
        return Math.floor(input.trials);
    }
    return input.allVariants ? 2 : 1;
}
function resolveVariants(input) {
    if (input.allVariants) {
        return [...DEFAULT_VARIANTS];
    }
    if (input.variant) {
        if (!DEFAULT_VARIANTS.includes(input.variant)) {
            throw new Error(`Unknown bench variant: ${input.variant}`);
        }
        return [input.variant];
    }
    return ["baseline"];
}
function resolveSelectedScenarios(allScenarios, input) {
    const requested = input.scenario ?? "all";
    if (requested === "all") {
        return allScenarios;
    }
    const scenario = allScenarios.find((candidate) => candidate.scenario_id === requested);
    if (!scenario) {
        throw new Error(`Unknown bench scenario: ${requested}`);
    }
    return [scenario];
}
function scenarioPrompt(scenario) {
    return scenario.prompt_turns
        .filter((turn) => turn.role === "user")
        .sort((left, right) => left.turn_idx - right.turn_idx)
        .map((turn) => turn.text)
        .join("\n\n");
}
function pluginDirForVariant(cwd, variant, env) {
    switch (variant) {
        case "baseline":
            return env.BENCH_PLUGIN_BASELINE ?? cwd;
        case "v1":
            return env.BENCH_PLUGIN_V1 ?? cwd;
        case "v2":
            return env.BENCH_PLUGIN_V2 ?? cwd;
    }
}
function apiKeyMapFromEnv(env) {
    return {
        ANTHROPIC_API_KEY_BASELINE: env.ANTHROPIC_API_KEY_BASELINE ?? env.ANTHROPIC_API_KEY,
        ANTHROPIC_API_KEY_V1: env.ANTHROPIC_API_KEY_V1,
        ANTHROPIC_API_KEY_V2: env.ANTHROPIC_API_KEY_V2,
    };
}
function roundMetric(value, digits = 6) {
    return Number(value.toFixed(digits));
}
function meanAndStd(values) {
    const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length > 0
        ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
        : 0;
    return { mean: roundMetric(mean), std: roundMetric(Math.sqrt(variance)) };
}
function summarizeUsages(usages, localWallMsValues = usages.map((usage) => usage.duration_ms)) {
    const duration = meanAndStd(usages.map((usage) => usage.duration_ms));
    const localWall = meanAndStd(localWallMsValues);
    const inputTokens = usages.reduce((sum, usage) => sum + usage.input_tokens, 0);
    const outputTokens = usages.reduce((sum, usage) => sum + usage.output_tokens, 0);
    const cacheCreationTokens = usages.reduce((sum, usage) => sum + usage.cache_creation_input_tokens, 0);
    const cacheReadTokens = usages.reduce((sum, usage) => sum + usage.cache_read_input_tokens, 0);
    return {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheCreationTokens,
        cache_read_input_tokens: cacheReadTokens,
        total_tokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
        duration_ms_mean: duration.mean,
        duration_ms_std: duration.std,
        local_wall_ms_mean: localWall.mean,
        local_wall_ms_std: localWall.std,
    };
}
export function buildSessionMemoryThresholdReport(input) {
    const latencyObserved = (axisId) => input.dryRun ? null : (input.hookLatencyMs?.[axisId] ?? null);
    const recallObserved = input.dryRun ? null : (input.averageRecallAt5 ?? 0);
    const recallStatusValue = input.dryRun
        ? null
        : (input.recallStatusValue ?? input.averageRecallAt5 ?? 0);
    const latencyStatus = (axisId, threshold) => {
        if (input.dryRun)
            return "schema-valid";
        const observed = latencyObserved(axisId);
        if (observed === null)
            return "not-instrumented";
        return observed <= threshold ? "passed" : "failed";
    };
    const recallStatus = (threshold) => {
        if (input.dryRun)
            return "schema-valid";
        if (input.recallFailure)
            return "failed";
        return (recallStatusValue ?? 0) >= threshold ? "passed" : "failed";
    };
    return {
        mode: input.dryRun ? "dry-run" : "measured",
        axes: [
            {
                id: "post_tool_capture_latency_ms",
                label: "PostToolUse capture latency",
                metric: "latency_ms",
                threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.postToolCaptureLatencyMs,
                observed: latencyObserved("post_tool_capture_latency_ms"),
                status: latencyStatus("post_tool_capture_latency_ms", DEFAULT_SESSION_MEMORY_THRESHOLDS.postToolCaptureLatencyMs),
            },
            {
                id: "precompact_snapshot_latency_ms",
                label: "PreCompact snapshot latency",
                metric: "latency_ms",
                threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.precompactSnapshotLatencyMs,
                observed: latencyObserved("precompact_snapshot_latency_ms"),
                status: latencyStatus("precompact_snapshot_latency_ms", DEFAULT_SESSION_MEMORY_THRESHOLDS.precompactSnapshotLatencyMs),
            },
            {
                id: "startup_resume_injection_latency_ms",
                label: "SessionStart resume injection latency",
                metric: "latency_ms",
                threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.startupResumeInjectionLatencyMs,
                observed: latencyObserved("startup_resume_injection_latency_ms"),
                status: latencyStatus("startup_resume_injection_latency_ms", DEFAULT_SESSION_MEMORY_THRESHOLDS.startupResumeInjectionLatencyMs),
            },
            {
                id: "search_quality_recall_at_5",
                label: "Search quality recall@5",
                metric: "recall_at_5",
                threshold: DEFAULT_SESSION_MEMORY_THRESHOLDS.searchQualityRecallAt5,
                observed: recallObserved,
                status: recallStatus(DEFAULT_SESSION_MEMORY_THRESHOLDS.searchQualityRecallAt5),
            },
        ],
    };
}
async function loadRuntimeModules(repoRoot = resolveBenchRuntimeRoot()) {
    const [manifestModule, scenarioModule, costModule, runnerModule, reportModule, scorerModule] = await Promise.all([
        import(pathToFileURL(resolve(repoRoot, "scripts", "bench", "lib", "manifest.ts")).href),
        import(pathToFileURL(resolve(repoRoot, "scripts", "bench", "scenarios", "_schema.ts")).href),
        import(pathToFileURL(resolve(repoRoot, "scripts", "bench", "lib", "cost-aggregator.ts")).href),
        import(pathToFileURL(resolve(repoRoot, "scripts", "bench", "lib", "variant-runner.ts")).href),
        import(pathToFileURL(resolve(repoRoot, "scripts", "bench", "lib", "report-writer.ts")).href),
        import(pathToFileURL(resolve(repoRoot, "scripts", "bench", "lib", "transcript-scorer.ts")).href),
    ]);
    return {
        aggregateCosts: costModule.aggregateCosts,
        captureManifest: manifestModule.captureManifest,
        loadAllScenarios: scenarioModule.loadAllScenarios,
        loadManifest: manifestModule.loadManifest,
        loadPricing: costModule.loadPricing,
        resolveWorkspaceConfig: manifestModule.resolveWorkspaceConfig,
        resolveWorkspaceIdentitiesFromEnv: manifestModule.resolveWorkspaceIdentitiesFromEnv,
        runCell: runnerModule.runCell,
        scoreTranscriptRecall: scorerModule.scoreTranscriptRecall,
        validateKnownAnthropicWorkspaces: manifestModule.validateKnownAnthropicWorkspaces,
        validateWorkspaceKeyPresence: manifestModule.validateWorkspaceKeyPresence,
        verifyManifest: manifestModule.verifyManifest,
        writeReport: reportModule.writeReport,
        writeArtifactJson: reportModule.writeArtifactJson,
    };
}
async function runWorkspacePreflight(runtime, workspaceConfig, env, options = {
    requireApiKeys: true,
    allowAdminVerification: true,
}) {
    if (options.requireApiKeys) {
        runtime.validateWorkspaceKeyPresence(workspaceConfig, env);
    }
    if (workspaceConfig.mode !== "isolated") {
        return;
    }
    const identities = runtime.resolveWorkspaceIdentitiesFromEnv(env);
    const adminKey = env.ANTHROPIC_ADMIN_KEY;
    if (options.allowAdminVerification &&
        workspaceConfig.adminVerification === "required-for-proof" &&
        typeof adminKey === "string" &&
        adminKey.length > 0) {
        await runtime.validateKnownAnthropicWorkspaces(identities, adminKey);
    }
}
function resolveWorkspaceConfigForRun(runtime, env, options) {
    if (options.dryRun &&
        env.BENCH_WORKSPACE_MODE !== "isolated" &&
        env.BENCH_WORKSPACE_MODE !== "single-workspace") {
        return runtime.resolveWorkspaceConfig({ ...env, BENCH_WORKSPACE_MODE: "single-workspace" });
    }
    return runtime.resolveWorkspaceConfig(env);
}
export async function runBenchSessionMemoryCommand(input, deps) {
    assertBenchSessionMemorySupportedRuntime(input.env);
    let runtimeRoot;
    const runtime = deps
        ? deps
        : await (async () => {
            runtimeRoot = resolveBenchRuntimeRoot();
            return loadRuntimeModules(runtimeRoot);
        })();
    const cwd = input.cwd ?? process.cwd();
    const env = input.env ?? process.env;
    const pinned = runtime.loadManifest();
    const captured = await runtime.captureManifest();
    runtime.verifyManifest(captured, pinned, {
        mode: input.dryRun ? "dry-run-current-checkout" : "strict",
    });
    const workspaceConfig = resolveWorkspaceConfigForRun(runtime, env, {
        dryRun: Boolean(input.dryRun),
    });
    await runWorkspacePreflight(runtime, workspaceConfig, env, {
        requireApiKeys: !input.dryRun,
        allowAdminVerification: !input.dryRun,
    });
    const allScenarios = runtime.loadAllScenarios();
    const scenarios = resolveSelectedScenarios(allScenarios, input);
    const variants = resolveVariants(input);
    const trials = normalizeTrials(input);
    const manifestDigest = createManifestDigest(pinned);
    const runId = createRunId(pinned);
    const outputRoot = input.outputRoot ?? resolve(runtimeRoot ?? process.cwd(), "scripts", "bench", "runs");
    if (input.dryRun) {
        return {
            exitCode: 0,
            runId,
            dryRun: true,
            reportPath: null,
            cellCount: scenarios.length * variants.length,
            thresholdReport: buildSessionMemoryThresholdReport({ dryRun: true }),
        };
    }
    const pricing = runtime.loadPricing();
    const model = input.model ?? pinned.model ?? DEFAULT_MODEL;
    const apiKeys = apiKeyMapFromEnv(env);
    const cells = [];
    const thresholdRecallValues = [];
    let recallFailure = false;
    for (const scenario of scenarios) {
        for (const variant of variants) {
            const results = [];
            for (let trial = 1; trial <= trials; trial += 1) {
                results.push(await runtime.runCell({
                    scenario: scenario.scenario_id,
                    prompt: scenarioPrompt(scenario),
                    variant,
                    trial,
                    pluginDir: pluginDirForVariant(cwd, variant, env),
                    runId,
                    cwd,
                    outputRoot,
                    apiKeys,
                    authMode: workspaceConfig.authMode,
                    claudeHome: env.BENCH_CLAUDE_HOME ?? env.HOME,
                }));
            }
            const okResults = results.filter((result) => result.ok);
            const failed = results.find((result) => !result.ok);
            const costSummary = okResults.length > 0
                ? runtime.aggregateCosts(okResults.map((result) => result.usage), pricing, model || DEFAULT_MODEL)
                : { mean: 0, std: 0, n: 0, total: 0 };
            const usageSummary = summarizeUsages(okResults.map((result) => result.usage), okResults.map((result) => result.local_wall_ms ?? result.usage.duration_ms));
            const wallSec = okResults.length > 0 ? roundMetric(usageSummary.local_wall_ms_mean / 1000) : 0;
            const recallScores = results.map((result) => {
                if (!result.ok) {
                    return {
                        recall_at_5: 0,
                        recall_error: result.failure_reason ?? result.error,
                    };
                }
                return runtime.scoreTranscriptRecall({
                    transcriptPath: result.transcript_path,
                    qrels: scenario.qrels,
                });
            });
            const averageRecallAt5 = recallScores.length > 0
                ? recallScores.reduce((sum, score) => sum + score.recall_at_5, 0) / recallScores.length
                : 0;
            const recallError = recallScores.find((score) => score.recall_error)?.recall_error;
            thresholdRecallValues.push(averageRecallAt5);
            if (failed || recallError) {
                recallFailure = true;
            }
            const recallReason = recallError
                ? undefined
                : recallScores
                    .map((score) => score.recall_reason)
                    .filter((reason) => typeof reason === "string" && reason.length > 0)
                    .join("; ");
            cells.push({
                scenario_id: scenario.scenario_id,
                variant,
                trials,
                status: failed?.error ?? "ok",
                cost_usd: costSummary.total,
                cost_mean_usd: costSummary.mean,
                cost_std_usd: costSummary.std,
                input_tokens: usageSummary.input_tokens,
                output_tokens: usageSummary.output_tokens,
                cache_creation_input_tokens: usageSummary.cache_creation_input_tokens,
                cache_read_input_tokens: usageSummary.cache_read_input_tokens,
                total_tokens: usageSummary.total_tokens,
                duration_ms_mean: usageSummary.duration_ms_mean,
                duration_ms_std: usageSummary.duration_ms_std,
                local_wall_ms_mean: usageSummary.local_wall_ms_mean,
                local_wall_ms_std: usageSummary.local_wall_ms_std,
                recall_at_5: Number(averageRecallAt5.toFixed(6)),
                ...(recallError ? { recall_error: recallError } : {}),
                ...(failed?.failure_reason ? { failure_reason: failed.failure_reason } : {}),
                ...(recallReason ? { recall_reason: recallReason } : {}),
                wall_sec: wallSec,
            });
        }
    }
    const reportPath = resolve(outputRoot, runId, "report.md");
    const artifactPath = resolve(outputRoot, runId, "report.json");
    const averageRecallAt5 = thresholdRecallValues.length > 0
        ? thresholdRecallValues.reduce((sum, recall) => sum + recall, 0) /
            thresholdRecallValues.length
        : 0;
    const thresholdReport = buildSessionMemoryThresholdReport({
        dryRun: false,
        averageRecallAt5: Number(averageRecallAt5.toFixed(6)),
        recallStatusValue: averageRecallAt5,
        recallFailure,
    });
    runtime.writeReport({
        run_id: runId,
        model,
        dry_run: false,
        cache_disclaimer: workspaceConfig.cacheDisclaimer,
        cells,
        threshold_report: thresholdReport,
    }, reportPath);
    const artifactSamples = cells.flatMap((cell) => [
        {
            metricKey: `${cell.scenario_id}.${cell.variant}.cost_usd`,
            value: cell.cost_usd,
            unit: "usd",
        },
        {
            metricKey: `${cell.scenario_id}.${cell.variant}.input_tokens`,
            value: cell.input_tokens,
            unit: "tokens",
        },
        {
            metricKey: `${cell.scenario_id}.${cell.variant}.output_tokens`,
            value: cell.output_tokens,
            unit: "tokens",
        },
        {
            metricKey: `${cell.scenario_id}.${cell.variant}.total_tokens`,
            value: cell.total_tokens,
            unit: "tokens",
        },
        {
            metricKey: `${cell.scenario_id}.${cell.variant}.duration_ms_mean`,
            value: cell.duration_ms_mean,
            unit: "ms",
        },
        {
            metricKey: `${cell.scenario_id}.${cell.variant}.local_wall_ms_mean`,
            value: cell.local_wall_ms_mean,
            unit: "ms",
        },
        {
            metricKey: `${cell.scenario_id}.${cell.variant}.recall_at_5`,
            value: cell.recall_at_5,
            unit: "ratio",
        },
    ]);
    const artifactAggregates = {
        average_recall_at_5: Number(averageRecallAt5.toFixed(6)),
        total_cells: cells.length,
    };
    const artifactThresholds = {};
    for (const axis of thresholdReport.axes) {
        artifactThresholds[axis.id] = {
            value: axis.threshold,
            unit: axis.metric,
            pass: axis.status === "passed" || axis.status === "schema-valid",
        };
    }
    const scenarioIds = [...new Set(cells.map((cell) => cell.scenario_id))].sort().join(",");
    const variantIds = [...new Set(cells.map((cell) => cell.variant))].sort().join(",");
    const artifact = {
        schemaVersion: "1",
        runId,
        manifestDigest,
        provenance: {
            gitCommit: pinned.claude,
            gitDirty: false,
            command: "wp bench session-memory",
            environment: "live",
        },
        scenarioSet: scenarioIds,
        variantSet: variantIds,
        warmup: 0,
        repetitions: trials,
        samples: artifactSamples,
        aggregates: artifactAggregates,
        thresholds: artifactThresholds,
        rawArtifactHashes: {},
        redactionStatus: "pending",
    };
    runtime.writeArtifactJson(artifact, artifactPath);
    const thresholdFailed = thresholdReport.axes.some((axis) => axis.status === "failed");
    return {
        exitCode: thresholdFailed ? 1 : 0,
        runId,
        dryRun: false,
        reportPath,
        cellCount: cells.length,
        thresholdReport,
    };
}
//# sourceMappingURL=session-memory.js.map