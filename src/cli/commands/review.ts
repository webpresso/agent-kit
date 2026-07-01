import type { CAC } from "cac";

import type { Dirent } from "node:fs";

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getProjectRoot } from "#cli/utils";

export type ReviewVerdict = "approve" | "approve-with-nits" | "reject" | "no-verdict";
export type ReviewTargetKind = "blueprint" | "pull-request";
export const REVIEWER_IDS = [
  "codex",
  "deepseek",
  "eng-review",
  "ceo-review",
  "mimo",
  "glm",
  "qwen",
  "kimi",
  "minimax",
  "hy3",
  "claude",
  "human",
] as const;
export type ReviewReviewerId = (typeof REVIEWER_IDS)[number];

export interface ReviewEntry {
  readonly id: string;
  readonly blueprintSlug: string;
  readonly blueprintPath: string;
  readonly targetKind: ReviewTargetKind;
  readonly targetId: string;
  readonly artifact?: string;
  readonly targetHash?: string;
  readonly timestamp: string;
  readonly reviewer: string;
  readonly verdict: ReviewVerdict;
  readonly rev?: string;
  readonly commit?: string;
  readonly evidence?: string;
  readonly note?: string;
  readonly taskType?: string;
  readonly findingsSurvived?: number;
  readonly falsePositives?: number;
  readonly latencyMs?: number;
  readonly agreementWithFinal?: boolean;
  readonly source: "legacy-table" | "structured";
}

interface ReviewCommandOptions {
  json?: boolean;
  projectRoot?: string;
  reviewer?: string;
  targetKind?: string;
  targetId?: string;
  artifact?: string;
  targetHash?: string;
  verdict?: string;
  rev?: string;
  commit?: string;
  evidence?: string;
  note?: string;
  taskType?: string;
  findingsSurvived?: string;
  falsePositives?: string;
  latencyMs?: string;
  agreementWithFinal?: string;
}

interface ReviewLedger {
  readonly blueprintSlug: string;
  readonly blueprintPath: string;
  readonly reviewsPath: string;
  readonly entries: readonly ReviewEntry[];
}

interface ReviewScoreboardRow {
  readonly reviewer: string;
  readonly taskType: string;
  readonly total: number;
  readonly approve: number;
  readonly approveWithNits: number;
  readonly reject: number;
  readonly noVerdict: number;
  readonly findingsSurvived: number;
  readonly falsePositives: number;
  readonly averageLatencyMs: number | null;
  readonly agreementWithFinalRate: number | null;
  readonly signalPrecision: number | null;
  readonly timeoutRate: number;
  readonly recommendation: string;
}

const REVIEW_CACHE_PATH = path.join(".webpresso", "reviews", "index.json");
const REVIEW_ENTRY_MARKER = "<!-- wp:review-entry ";
const REVIEW_SECTION_HEADING = "## Review entries";

interface ResolvedReviewBlueprint {
  readonly slug: string;
  readonly path: string;
}

function normalizeReviewer(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) throw new Error("Missing required --reviewer.");
  return normalized;
}

function parseReviewerId(value: string | undefined): ReviewReviewerId {
  const normalized = normalizeReviewer(value ?? "");
  if ((REVIEWER_IDS as readonly string[]).includes(normalized)) {
    return normalized as ReviewReviewerId;
  }
  throw new Error(`Invalid --reviewer: ${value}. Valid reviewers: ${REVIEWER_IDS.join(", ")}.`);
}

function normalizeVerdict(value: string | undefined): ReviewVerdict {
  switch (value?.trim().toLowerCase()) {
    case "approve":
      return "approve";
    case "approve-with-nits":
    case "approve_with_nits":
    case "approvewithnits":
      return "approve-with-nits";
    case "reject":
      return "reject";
    case "no-verdict":
    case "no_verdict":
    case "no verdict":
      return "no-verdict";
    default:
      throw new Error(
        "Missing or invalid --verdict. Valid values: approve, approve-with-nits, reject, no-verdict.",
      );
  }
}

function parseOptionalNumber(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${flag}: ${value}`);
  }
  return parsed;
}

function parseOptionalBoolean(value: string | undefined, flag: string): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid ${flag}: ${value}. Use true or false.`);
}

function normalizeTargetKind(
  value: string | undefined,
  fallback: ReviewTargetKind = "blueprint",
): ReviewTargetKind {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (
    normalized === "blueprint" ||
    normalized === "pull-request" ||
    normalized === "pull_request"
  ) {
    return normalized === "pull_request" ? "pull-request" : normalized;
  }
  throw new Error("Invalid --target-kind. Valid values: blueprint, pull-request.");
}

function reviewCacheAbsolutePath(projectRoot: string): string {
  return path.join(projectRoot, REVIEW_CACHE_PATH);
}

function reviewsPathForBlueprint(blueprintPath: string): string {
  const basename = path.basename(blueprintPath);
  if (basename !== "_overview.md") {
    throw new Error(
      `Blueprint review logging requires folder blueprints with sibling reviews.md; ${blueprintPath} is a flat blueprint.`,
    );
  }
  return path.join(path.dirname(blueprintPath), "reviews.md");
}

function parseLegacyTableEntries(
  markdown: string,
  blueprintSlug: string,
  blueprintPath: string,
  reviewsPath: string,
): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    const [date = "", reviewer = "", rev = "", verdict = "", note = ""] = cells;
    if (!reviewer || reviewer.toLowerCase() === "reviewer") continue;
    const normalizedReviewer = normalizeReviewer(reviewer);
    const normalizedVerdict = normalizeLegacyVerdict(verdict);
    if (!normalizedVerdict) continue;
    entries.push({
      id: `legacy:${date}:${normalizedReviewer}:${rev}`,
      blueprintSlug,
      blueprintPath,
      targetKind: "blueprint",
      targetId: blueprintSlug,
      timestamp: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : date,
      reviewer: normalizedReviewer,
      verdict: normalizedVerdict,
      ...(rev && rev !== "Rev" ? { rev } : {}),
      evidence: path.basename(reviewsPath),
      ...(note && note !== "Note" ? { note } : {}),
      source: "legacy-table",
    });
  }
  return entries;
}

function normalizeLegacyVerdict(value: string): ReviewVerdict | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "approve") return "approve";
  if (normalized === "approve-with-nits" || normalized === "approve with nits")
    return "approve-with-nits";
  if (normalized === "reject") return "reject";
  if (normalized === "no-verdict" || normalized === "no verdict") return "no-verdict";
  return null;
}

function parseStructuredEntries(markdown: string): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(REVIEW_ENTRY_MARKER) || !trimmed.endsWith("-->")) continue;
    const json = trimmed.slice(REVIEW_ENTRY_MARKER.length, -3).trim();
    try {
      const parsed = JSON.parse(json) as ReviewEntry;
      entries.push({ ...parsed, source: "structured" });
    } catch {
      // Ignore malformed structured entries; human ledger remains source-visible.
    }
  }
  return entries;
}

function dedupeReviewEntries(entries: readonly ReviewEntry[]): ReviewEntry[] {
  const deduped = new Map<string, ReviewEntry>();
  for (const entry of entries) {
    const semanticKey = [
      entry.reviewer,
      entry.rev ?? "",
      entry.verdict,
      entry.timestamp.slice(0, 10),
    ].join("::");
    const existing = deduped.get(semanticKey);
    if (!existing || (existing.source === "legacy-table" && entry.source === "structured")) {
      deduped.set(semanticKey, entry);
    }
  }
  return [...deduped.values()];
}

export async function readReviewLedger(projectRoot: string, slug: string): Promise<ReviewLedger> {
  const location = resolveReviewBlueprint(projectRoot, slug);
  const reviewsPath = reviewsPathForBlueprint(location.path);
  const markdown = readFileSync(reviewsPath, "utf8");
  const legacy = parseLegacyTableEntries(markdown, location.slug, location.path, reviewsPath);
  const structured = parseStructuredEntries(markdown).map((entry) => ({
    ...entry,
    blueprintSlug: location.slug,
    blueprintPath: location.path,
  }));
  const deduped = dedupeReviewEntries([...legacy, ...structured]);
  return {
    blueprintSlug: location.slug,
    blueprintPath: location.path,
    reviewsPath,
    entries: deduped.toSorted((a, b) => a.timestamp.localeCompare(b.timestamp)),
  };
}

function ensureReviewLedgerSkeleton(slug: string): string {
  return [
    `# Review ledger — ${slug}`,
    "",
    "Committed second-brain record of review rounds for this blueprint.",
    "",
    "| Date | Reviewer | Rev | Verdict | Note |",
    "| --- | --- | --- | --- | --- |",
    "",
    REVIEW_SECTION_HEADING,
    "",
  ].join("\n");
}

function appendTableRow(markdown: string, entry: ReviewEntry): string {
  const lines = markdown.split("\n");
  const separatorIndex = lines.findIndex(
    (line) => line.trim() === "| --- | --- | --- | --- | --- |",
  );
  if (separatorIndex === -1) {
    return `${ensureReviewLedgerSkeleton(entry.blueprintSlug)}| ${entry.timestamp.slice(0, 10)} | ${
      entry.reviewer
    } | ${entry.rev ?? ""} | ${entry.verdict.toUpperCase()} | ${entry.note ?? ""} |\n`;
  }
  let insertIndex = separatorIndex + 1;
  while (insertIndex < lines.length && lines[insertIndex]?.trim().startsWith("|")) insertIndex += 1;
  lines.splice(
    insertIndex,
    0,
    `| ${entry.timestamp.slice(0, 10)} | ${entry.reviewer} | ${entry.rev ?? ""} | ${entry.verdict.toUpperCase()} | ${entry.note ?? ""} |`,
  );
  return `${lines.join("\n")}\n`;
}

function appendStructuredEntry(markdown: string, entry: ReviewEntry): string {
  const payload = JSON.stringify(entry);
  const block = [
    REVIEW_SECTION_HEADING,
    "",
    `${REVIEW_ENTRY_MARKER}${payload} -->`,
    `### ${entry.timestamp.slice(0, 10)} — ${entry.reviewer} — ${entry.verdict.toUpperCase()}`,
    "",
    ...(entry.note ? [entry.note, ""] : []),
  ].join("\n");

  if (markdown.includes(`${REVIEW_ENTRY_MARKER}${payload} -->`)) return markdown;
  if (markdown.includes(REVIEW_SECTION_HEADING)) {
    return `${markdown.trimEnd()}\n\n${block}\n`;
  }
  return `${markdown.trimEnd()}\n\n${block}\n`;
}

function updateReviewCache(projectRoot: string, entries: readonly ReviewEntry[]): void {
  const cachePath = reviewCacheAbsolutePath(projectRoot);
  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(
    cachePath,
    `${JSON.stringify({ version: 1, entries: [...entries].toSorted((a, b) => b.timestamp.localeCompare(a.timestamp)) }, null, 2)}\n`,
    "utf8",
  );
}

function scanAllReviewLedgers(projectRoot: string): ReviewEntry[] {
  const blueprintsRoot = path.join(projectRoot, "blueprints");
  const entries: ReviewEntry[] = [];
  const walk = (dir: string): void => {
    for (const item of readDirSafe(dir)) {
      const absolute = path.join(dir, item.name);
      if (item.isFile() && item.name === "reviews.md") {
        const blueprintPath = path.join(dir, "_overview.md");
        if (!existsSync(blueprintPath)) continue;
        const slug = deriveSlugFromBlueprintPath(projectRoot, blueprintPath);
        const markdown = readFileSync(absolute, "utf8");
        entries.push(...parseLegacyTableEntries(markdown, slug, blueprintPath, absolute));
        entries.push(
          ...parseStructuredEntries(markdown).map((entry) => ({
            ...entry,
            blueprintSlug: slug,
            blueprintPath,
          })),
        );
        continue;
      }
      if (item.isDirectory()) walk(absolute);
    }
  };
  if (!existsSync(blueprintsRoot)) return [];
  walk(blueprintsRoot);
  return dedupeReviewEntries(entries);
}

function deriveSlugFromBlueprintPath(projectRoot: string, blueprintPath: string): string {
  const relative = path
    .relative(path.join(projectRoot, "blueprints"), blueprintPath)
    .replace(/\\/g, "/");
  return relative.replace(/\/_overview\.md$/, "");
}

function readDirSafe(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return [];
  }
}

function listReviewableBlueprints(projectRoot: string): ResolvedReviewBlueprint[] {
  const blueprintsRoot = path.join(projectRoot, "blueprints");
  const found: ResolvedReviewBlueprint[] = [];
  const walk = (dir: string): void => {
    for (const item of readDirSafe(dir)) {
      const absolute = path.join(dir, item.name);
      if (item.isDirectory()) {
        const overviewPath = path.join(absolute, "_overview.md");
        if (existsSync(overviewPath)) {
          found.push({
            slug: deriveSlugFromBlueprintPath(projectRoot, overviewPath),
            path: overviewPath,
          });
          continue;
        }
        walk(absolute);
      }
    }
  };
  if (!existsSync(blueprintsRoot)) return [];
  walk(blueprintsRoot);
  return found;
}

function resolveReviewBlueprint(projectRoot: string, slug: string): ResolvedReviewBlueprint {
  const normalized = slug
    .trim()
    .replace(/^blueprints\//u, "")
    .replace(/\/_overview\.md$/u, "");
  const candidates = listReviewableBlueprints(projectRoot).filter(
    (entry) => entry.slug === normalized || entry.slug.endsWith(`/${normalized}`),
  );
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new Error(`Blueprint not found for review ledger: ${slug}`);
  }
  throw new Error(
    `Blueprint slug "${slug}" is ambiguous across lifecycle folders: ${candidates
      .map((entry) => entry.slug)
      .join(", ")}`,
  );
}

export async function logReviewEntry(
  projectRoot: string,
  slug: string,
  input: ReviewCommandOptions,
): Promise<ReviewEntry> {
  const location = resolveReviewBlueprint(projectRoot, slug);
  const reviewsPath = reviewsPathForBlueprint(location.path);
  const timestamp = new Date().toISOString();
  const reviewer = parseReviewerId(input.reviewer);
  const targetKind = normalizeTargetKind(input.targetKind, "blueprint");
  const entry: ReviewEntry = {
    id: `${timestamp}:${reviewer}:${input.rev ?? "final"}`,
    blueprintSlug: location.slug,
    blueprintPath: location.path,
    targetKind,
    targetId: input.targetId?.trim() || location.slug,
    ...(input.artifact?.trim() ? { artifact: input.artifact.trim() } : {}),
    ...(input.targetHash?.trim() ? { targetHash: input.targetHash.trim() } : {}),
    timestamp,
    reviewer,
    verdict: normalizeVerdict(input.verdict),
    ...(input.rev ? { rev: input.rev } : {}),
    ...(input.commit ? { commit: input.commit } : {}),
    evidence: input.evidence?.trim() || "reviews.md",
    ...(input.note ? { note: input.note } : {}),
    ...(input.taskType ? { taskType: input.taskType } : {}),
    ...(parseOptionalNumber(input.findingsSurvived, "--findings-survived") !== undefined
      ? { findingsSurvived: parseOptionalNumber(input.findingsSurvived, "--findings-survived") }
      : {}),
    ...(parseOptionalNumber(input.falsePositives, "--false-positives") !== undefined
      ? { falsePositives: parseOptionalNumber(input.falsePositives, "--false-positives") }
      : {}),
    ...(parseOptionalNumber(input.latencyMs, "--latency-ms") !== undefined
      ? { latencyMs: parseOptionalNumber(input.latencyMs, "--latency-ms") }
      : {}),
    ...(parseOptionalBoolean(input.agreementWithFinal, "--agreement-with-final") !== undefined
      ? {
          agreementWithFinal: parseOptionalBoolean(
            input.agreementWithFinal,
            "--agreement-with-final",
          ),
        }
      : {}),
    source: "structured",
  };

  let markdown = existsSync(reviewsPath)
    ? readFileSync(reviewsPath, "utf8")
    : ensureReviewLedgerSkeleton(location.slug);
  markdown = appendTableRow(markdown, entry);
  markdown = appendStructuredEntry(markdown, entry);
  mkdirSync(path.dirname(reviewsPath), { recursive: true });
  writeFileSync(reviewsPath, markdown, "utf8");

  updateReviewCache(projectRoot, scanAllReviewLedgers(projectRoot));
  return entry;
}

export function buildReviewScoreboard(
  entries: readonly ReviewEntry[],
): readonly ReviewScoreboardRow[] {
  const grouped = new Map<string, ReviewEntry[]>();
  for (const entry of entries) {
    const taskType = entry.taskType?.trim() || "unspecified";
    const groupKey = `${entry.reviewer}::${taskType}`;
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(entry);
    grouped.set(groupKey, bucket);
  }
  return [...grouped.entries()]
    .map(([groupKey, rows]) => {
      const parts = groupKey.split("::");
      const reviewer = parts[0] ?? "unknown";
      const taskType = parts[1] ?? "unspecified";
      const latencyValues = rows
        .map((row) => row.latencyMs)
        .filter((value): value is number => typeof value === "number");
      const agreementValues = rows
        .map((row) => row.agreementWithFinal)
        .filter((value): value is boolean => typeof value === "boolean");
      const findingsSurvived = rows.reduce((sum, row) => sum + (row.findingsSurvived ?? 0), 0);
      const falsePositives = rows.reduce((sum, row) => sum + (row.falsePositives ?? 0), 0);
      const signalPrecisionDenominator = findingsSurvived + falsePositives;
      const signalPrecision =
        signalPrecisionDenominator > 0 ? findingsSurvived / signalPrecisionDenominator : null;
      const timeoutRate =
        rows.length > 0
          ? rows.filter((row) => row.verdict === "no-verdict").length / rows.length
          : 0;
      const agreementWithFinalRate =
        agreementValues.length > 0
          ? agreementValues.filter(Boolean).length / agreementValues.length
          : null;
      return {
        reviewer,
        taskType,
        total: rows.length,
        approve: rows.filter((row) => row.verdict === "approve").length,
        approveWithNits: rows.filter((row) => row.verdict === "approve-with-nits").length,
        reject: rows.filter((row) => row.verdict === "reject").length,
        noVerdict: rows.filter((row) => row.verdict === "no-verdict").length,
        findingsSurvived,
        falsePositives,
        averageLatencyMs:
          latencyValues.length > 0
            ? Math.round(
                latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length,
              )
            : null,
        agreementWithFinalRate:
          agreementWithFinalRate === null ? null : Math.round(agreementWithFinalRate * 1000) / 1000,
        signalPrecision:
          signalPrecision === null ? null : Math.round(signalPrecision * 1000) / 1000,
        timeoutRate: Math.round(timeoutRate * 1000) / 1000,
        recommendation: buildRoutingRecommendation({
          taskType,
          total: rows.length,
          signalPrecision,
          timeoutRate,
        }),
      } satisfies ReviewScoreboardRow;
    })
    .toSorted((a, b) => {
      const reviewerCompare = a.reviewer.localeCompare(b.reviewer);
      return reviewerCompare !== 0 ? reviewerCompare : a.taskType.localeCompare(b.taskType);
    });
}

function buildRoutingRecommendation(input: {
  taskType: string;
  total: number;
  signalPrecision: number | null;
  timeoutRate: number;
}): string {
  const taskLabel = input.taskType === "unspecified" ? "general review" : input.taskType;
  if (input.total < 2) return `Insufficient evidence for ${taskLabel}; collect more reviews first.`;
  if (input.timeoutRate >= 0.3) {
    return `Use as a secondary voice for ${taskLabel}; timeout / no-verdict rate is elevated.`;
  }
  if (input.signalPrecision !== null && input.signalPrecision >= 0.7) {
    return `Prefer for ${taskLabel}; surviving findings currently outweigh false positives.`;
  }
  if (input.signalPrecision !== null && input.signalPrecision <= 0.4) {
    return `Use with another reviewer for ${taskLabel}; false positives are relatively high.`;
  }
  return `Viable for ${taskLabel}, but pair with another reviewer when the decision is high-stakes.`;
}

function formatReviewEntries(ledger: ReviewLedger): string {
  return [
    `${ledger.blueprintSlug}`,
    `reviews: ${ledger.reviewsPath}`,
    "",
    ...ledger.entries.map(
      (entry) =>
        `- ${entry.timestamp.slice(0, 10)} ${entry.reviewer} ${entry.verdict}${entry.rev ? ` rev=${entry.rev}` : ""}${
          entry.note ? ` — ${entry.note}` : ""
        }`,
    ),
  ].join("\n");
}

function formatReviewScoreboard(rows: readonly ReviewScoreboardRow[]): string {
  if (rows.length === 0) return "No review records found.";
  return [
    "reviewer  task-type    total  approve  approve-with-nits  reject  no-verdict  findings-survived  false-positives  avg-latency-ms  agreement  precision  timeout-rate  recommendation",
    ...rows.map(
      (row) =>
        `${row.reviewer.padEnd(8)}  ${row.taskType.padEnd(11)}  ${String(row.total).padStart(5)}  ${String(row.approve).padStart(7)}  ${String(row.approveWithNits).padStart(17)}  ${String(row.reject).padStart(6)}  ${String(row.noVerdict).padStart(10)}  ${String(row.findingsSurvived).padStart(18)}  ${String(row.falsePositives).padStart(15)}  ${String(row.averageLatencyMs ?? "-").padStart(14)}  ${String(row.agreementWithFinalRate ?? "-").padStart(9)}  ${String(row.signalPrecision ?? "-").padStart(9)}  ${String(row.timeoutRate).padStart(12)}  ${row.recommendation}`,
    ),
  ].join("\n");
}

export function registerReviewCommand(cli: CAC): void {
  cli
    .command("review [subcommand] [...args]", "Blueprint review ledger and reviewer scoreboard")
    .option("--json", "Emit JSON output")
    .option("--project-root <path>", "Override the project root")
    .option("--reviewer <name>", "Reviewer id for `review log`")
    .option("--target-kind <kind>", "blueprint | pull-request")
    .option("--target-id <id>", "Target slug / PR number / stable review target id")
    .option("--artifact <path>", "Committed review transcript/artifact path relative to blueprint")
    .option("--target-hash <hash>", "Reviewed content hash / head sha for the target")
    .option("--verdict <verdict>", "approve | approve-with-nits | reject | no-verdict")
    .option("--rev <rev>", "Review revision label")
    .option("--commit <sha>", "Commit or content hash reviewed")
    .option("--evidence <path>", "Evidence path relative to the blueprint folder")
    .option("--note <text>", "Human-readable review note")
    .option("--task-type <type>", "Task/routing type for scoreboard analytics")
    .option("--findings-survived <n>", "How many findings survived final implementation")
    .option("--false-positives <n>", "How many findings were false positives")
    .option("--latency-ms <n>", "Review latency in milliseconds")
    .option(
      "--agreement-with-final <bool>",
      "Whether this review matched the final outcome (true|false)",
    )
    .action(
      async (subcommand: string | undefined, args: string[], options: ReviewCommandOptions) => {
        const projectRoot = options.projectRoot ?? getProjectRoot();
        switch (subcommand) {
          case "log": {
            const slug = args[0];
            if (!slug)
              throw new Error(
                "Usage: wp review log <blueprint-slug> --reviewer <name> --verdict <verdict>",
              );
            const entry = await logReviewEntry(projectRoot, slug, options);
            console.log(
              options.json
                ? JSON.stringify(entry, null, 2)
                : `Logged review ${entry.id} -> ${entry.blueprintSlug}`,
            );
            return;
          }
          case "read": {
            const slug = args[0];
            if (!slug) throw new Error("Usage: wp review read <blueprint-slug>");
            const ledger = await readReviewLedger(projectRoot, slug);
            console.log(
              options.json ? JSON.stringify(ledger, null, 2) : formatReviewEntries(ledger),
            );
            return;
          }
          case "scoreboard": {
            const rows = buildReviewScoreboard(scanAllReviewLedgers(projectRoot));
            console.log(
              options.json ? JSON.stringify(rows, null, 2) : formatReviewScoreboard(rows),
            );
            return;
          }
          default:
            throw new Error("Unknown review subcommand. Use one of: log, read, scoreboard");
        }
      },
    );
}
