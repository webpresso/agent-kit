import type { Blueprint } from "#core/parser";

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { parseBlueprint } from "#core/parser";
import { lifecycleBlueprintStatusSchema } from "#core/schema";
import { readBlueprintExecutionArtifacts } from "#execution/artifacts";
import { findResolvableOwnerBinding } from "#worktrees/manager.js";
import { readBlueprintExecutionMetadata } from "#execution/metadata";
import { BlueprintService } from "#service/BlueprintService";
import { scanBlueprintDirectory } from "#service/scanner";
import { resolveBlueprintRoot } from "#utils/blueprint-root";
import { parseBlueprintDocumentRelativePath } from "#utils/document-paths.js";

import { relativeBlueprintSlug } from "./local.js";

export interface BlueprintAuditIssue {
  file?: string;
  level: "error" | "warning";
  message: string;
}

export interface BlueprintAuditResult {
  issues: BlueprintAuditIssue[];
  ok: boolean;
}

export interface RunBlueprintAuditOptions {
  all?: boolean;
  projectRoot: string;
  stagedFiles?: string[];
  strict?: boolean;
}

interface LifecycleAuditFrontmatter {
  historicalZeroTaskRationale?: unknown;
  historicalZeroTaskWaiver?: unknown;
  status?: unknown;
  type?: unknown;
  worktreeOwnerId?: unknown;
  worktreeOwnerBranch?: unknown;
  approvals?: unknown;
}

interface ApprovalEntry {
  reviewer: string;
  verdict: string;
  commit?: string;
  evidence?: string;
  rev?: string;
  targetHash?: string;
}

interface ApprovalReviewRecord {
  reviewer: string;
  verdict: string;
  commit?: string;
  rev?: string;
  targetHash?: string;
}

function isBlueprintOverview(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  const roots = ["webpresso/blueprints/", "blueprints/"];
  for (const root of roots) {
    const index = normalized.indexOf(root);
    if (index === -1) continue;
    return parseBlueprintDocumentRelativePath(normalized.slice(index + root.length)) !== null;
  }
  return false;
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, "/");
}

function readLifecycleAuditFrontmatter(raw: string): LifecycleAuditFrontmatter {
  const data = matter(raw).data as Record<string, unknown>;
  return {
    historicalZeroTaskRationale: data.historical_zero_task_rationale,
    historicalZeroTaskWaiver: data.historical_zero_task_waiver,
    status: data.status,
    type: data.type,
    worktreeOwnerId: data.worktree_owner_id,
    worktreeOwnerBranch: data.worktree_owner_branch,
    approvals: data.approvals,
  };
}

/**
 * The approval gate fires at the `draft`→`planned` promotion boundary (governance
 * Piece 1). Later statuses (`in-progress`, `completed`) reached planned first via
 * the transition matrix, so they inherit the approval; `parked`/`archived` are
 * paused/abandoned. Checking only `planned` keeps the gate at the boundary it
 * governs and avoids re-flagging already-promoted blueprints.
 */
const APPROVAL_GATED_STATUSES = new Set(["planned"]);

/**
 * Promotion gate: a blueprint past `draft` must carry ≥2 approvals from DISTINCT
 * reviewers in its committed `_overview.md` frontmatter `approvals:` (the gate
 * input; the markdown `## Approvals` checklist is a mirror). Frontmatter is
 * version-controlled, so a fabricated tick is visible in git history / PR review.
 */
/**
 * Count DISTINCT reviewers with an `approve` verdict in a frontmatter
 * `approvals:` value. Shared by the audit sweep (warning) and the promote-time
 * hard gate so both apply identical logic.
 */
export function countDistinctApprovals(approvals: unknown): number {
  return new Set(
    normalizeApprovalEntries(approvals)
      .filter((entry) => entry.verdict === "approve")
      .map((entry) => entry.reviewer),
  ).size;
}

function normalizeApprovalEntries(approvals: unknown): ApprovalEntry[] {
  const entries = Array.isArray(approvals) ? approvals : [];
  return entries
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      reviewer: String(e.reviewer ?? "")
        .trim()
        .toLowerCase(),
      verdict: String(e.verdict ?? "")
        .trim()
        .toLowerCase(),
      commit:
        typeof e.commit === "string" && e.commit.trim().length > 0 ? e.commit.trim() : undefined,
      evidence:
        typeof e.evidence === "string" && e.evidence.trim().length > 0
          ? e.evidence.trim()
          : undefined,
      rev: typeof e.rev === "string" && e.rev.trim().length > 0 ? e.rev.trim() : undefined,
      targetHash:
        typeof e.targetHash === "string" && e.targetHash.trim().length > 0
          ? e.targetHash.trim()
          : undefined,
    }))
    .filter((entry) => entry.reviewer.length > 0);
}

function resolveApprovalEvidencePath(file: string, evidence: string | undefined): string | null {
  if (!evidence) return null;
  if (path.isAbsolute(evidence)) return null;
  const normalizedEvidence = normalizePath(evidence);
  if (
    normalizedEvidence.length === 0 ||
    normalizedEvidence === "." ||
    normalizedEvidence.startsWith("../") ||
    normalizedEvidence.includes("/../")
  ) {
    return null;
  }
  const resolved = path.resolve(path.dirname(file), evidence);
  const blueprintDir = path.dirname(file);
  const relativeToBlueprint = normalizePath(path.relative(blueprintDir, resolved));
  if (relativeToBlueprint === ".." || relativeToBlueprint.startsWith("../")) return null;
  if (!existsSync(resolved)) return null;
  if (!isGitTracked(findGitRoot(file), resolved)) return null;
  return resolved;
}

const REVIEW_ENTRY_MARKER = "<!-- wp:review-entry ";

function parseApprovalReviewRecordsFromLedger(markdown: string): ApprovalReviewRecord[] {
  const records: ApprovalReviewRecord[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(REVIEW_ENTRY_MARKER) && trimmed.endsWith("-->")) {
      const json = trimmed.slice(REVIEW_ENTRY_MARKER.length, -3).trim();
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        records.push({
          reviewer: String(parsed.reviewer ?? "")
            .trim()
            .toLowerCase(),
          verdict: String(parsed.verdict ?? "")
            .trim()
            .toLowerCase(),
          commit:
            typeof parsed.commit === "string" && parsed.commit.trim().length > 0
              ? parsed.commit.trim()
              : undefined,
          rev:
            typeof parsed.rev === "string" && parsed.rev.trim().length > 0
              ? parsed.rev.trim()
              : undefined,
          targetHash:
            typeof parsed.targetHash === "string" && parsed.targetHash.trim().length > 0
              ? parsed.targetHash.trim()
              : undefined,
        });
      } catch {
        // Ignore malformed structured records; they remain human-visible evidence only.
      }
      continue;
    }

    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    const reviewer = cells[1]?.toLowerCase();
    const verdict = cells[3]?.toLowerCase();
    if (!reviewer || reviewer === "reviewer") continue;
    records.push({
      reviewer,
      verdict: verdict ?? "",
      ...(cells[2] && cells[2] !== "Rev" ? { rev: cells[2] } : {}),
    });
  }
  return records;
}

function approvalMatchesRecord(entry: ApprovalEntry, record: ApprovalReviewRecord): boolean {
  if (record.reviewer !== entry.reviewer || record.verdict !== "approve") return false;
  if (entry.rev !== undefined && record.rev !== entry.rev) return false;
  if (entry.commit !== undefined && record.commit !== entry.commit) return false;
  if (entry.targetHash !== undefined && record.targetHash !== entry.targetHash) return false;
  return true;
}

function findGitRoot(file: string): string | null {
  let current = path.dirname(file);
  while (true) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isGitTracked(repoRoot: string | null, file: string): boolean {
  if (!repoRoot) return false;
  const relative = path.relative(repoRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relative], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function countDistinctLogBackedApprovals(file: string, approvals: unknown): number {
  const distinct = new Set<string>();
  for (const entry of normalizeApprovalEntries(approvals)) {
    if (entry.verdict !== "approve") continue;
    const evidencePath = resolveApprovalEvidencePath(file, entry.evidence);
    if (!evidencePath) continue;
    const records = parseApprovalReviewRecordsFromLedger(readFileSync(evidencePath, "utf8"));
    if (records.some((record) => approvalMatchesRecord(entry, record))) {
      distinct.add(entry.reviewer);
    }
  }
  return distinct.size;
}

export function validateApprovalGate(
  file: string,
  frontmatter: LifecycleAuditFrontmatter,
): BlueprintAuditIssue[] {
  if (frontmatter.type !== "blueprint") return [];
  const status = typeof frontmatter.status === "string" ? frontmatter.status : "";
  if (!APPROVAL_GATED_STATUSES.has(status)) return [];

  const distinct = countDistinctLogBackedApprovals(file, frontmatter.approvals);
  if (distinct < 2) {
    return [
      {
        file,
        level: "error",
        message: `Blueprint is '${status}' but frontmatter \`approvals:\` has ${distinct} distinct approving reviewer(s) backed by committed review evidence (need ≥2). Promotion past draft requires ≥2 distinct reviewer approvals with matching committed review records — see catalog/agent/rules/pre-implementation.md.`,
      },
    ];
  }
  return [];
}

function countTaskHeadings(raw: string): number {
  return raw.match(/^####\s+(?:\[[^\]]+\]\s+)?Task\s+/gm)?.length ?? 0;
}

function readTaskStatusLines(raw: string): Map<string, string | undefined> {
  const taskBlocks = raw.split(/^####\s+(?:\[[^\]]+\]\s+)?Task\s+/m).slice(1);
  const result = new Map<string, string | undefined>();

  for (const block of taskBlocks) {
    const idMatch = block.match(/^(\d+(?:\.\d+)+):/);
    if (!idMatch?.[1]) continue;
    const statusMatch = block.match(/\*\*Status:\*\*\s*(.+)/i);
    result.set(idMatch[1], normalizeInlineTaskStatus(statusMatch?.[1]));
  }

  return result;
}

function normalizeInlineTaskStatus(rawStatus: string | undefined): string | undefined {
  if (!rawStatus) return undefined;
  return (
    rawStatus
      .trim()
      .split(/\s*\|\s*|\s+(?=\*\*(?:Status|Depends|Blocked|Wave|Files|Acceptance):\*\*)/i)[0]
      ?.trim()
      .replace(/\bin_progress\b/gi, "in-progress") ?? ""
  );
}

function validateTaskState(blueprint: Blueprint): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = [];
  const explicitStatuses = readTaskStatusLines(blueprint.raw);

  for (const task of blueprint.tasks) {
    const explicitStatus = explicitStatuses.get(task.id);
    if (!explicitStatus) {
      issues.push({
        level: "error",
        message: `Task ${task.id} has no **Status:** line (only checkboxes); add explicit **Status:**.`,
      });
      continue;
    }

    if (!lifecycleTaskStatuses.has(explicitStatus)) {
      issues.push({
        level: "error",
        message: `Task ${task.id} has invalid status "${explicitStatus}".`,
      });
    }

    const { checked, total } = task.acceptanceCriteria;
    if (task.status === "done" && total > 0 && checked !== total) {
      issues.push({
        level: "error",
        message: `Task ${task.id} is done but acceptance is ${checked}/${total}.`,
      });
    }
    if (task.status === "blocked" && !task.blockedReason?.trim()) {
      issues.push({
        level: "error",
        message: `Task ${task.id} is blocked but missing **Blocked:** reason.`,
      });
    }
    if (task.status !== "blocked" && task.blockedReason?.trim()) {
      issues.push({
        level: "error",
        message: `Task ${task.id} has blocked reason but status ${task.status}.`,
      });
    }
  }

  return issues;
}

function validateBlueprintSlugUniqueness(
  blueprints: Array<{ path: string; slug: string }>,
): BlueprintAuditIssue[] {
  const grouped = new Map<string, Array<{ file: string; slug: string }>>();

  for (const blueprint of blueprints) {
    const normalizedSlug = relativeBlueprintSlug(blueprint.slug);
    const existing = grouped.get(normalizedSlug);
    if (existing) {
      existing.push({ file: blueprint.path, slug: blueprint.slug });
    } else {
      grouped.set(normalizedSlug, [{ file: blueprint.path, slug: blueprint.slug }]);
    }
  }

  const issues: BlueprintAuditIssue[] = [];

  for (const [normalizedSlug, entries] of grouped) {
    const uniqueLifecycleSlugs = new Set(entries.map((entry) => entry.slug));
    if (uniqueLifecycleSlugs.size <= 1) continue;

    issues.push({
      file: entries[0]?.file,
      level: "error",
      message: `Blueprint slug "${normalizedSlug}" appears in multiple lifecycle locations: ${Array.from(
        uniqueLifecycleSlugs,
      )
        .toSorted()
        .join(", ")}.`,
    });
  }

  return issues;
}

function hasHistoricalZeroTaskRationale(frontmatter: LifecycleAuditFrontmatter): boolean {
  return (
    frontmatter.historicalZeroTaskWaiver === true &&
    typeof frontmatter.historicalZeroTaskRationale === "string" &&
    frontmatter.historicalZeroTaskRationale.trim().length > 0
  );
}

function validateCompletedZeroTaskBlueprint(
  file: string,
  frontmatter: LifecycleAuditFrontmatter,
  taskHeadingCount: number,
): BlueprintAuditIssue[] {
  if (
    frontmatter.status !== "completed" ||
    taskHeadingCount > 0 ||
    hasHistoricalZeroTaskRationale(frontmatter)
  ) {
    return [];
  }

  return [
    {
      file,
      level: "error",
      message:
        "A completed zero-task blueprint requires explicit historical zero-task waiver and rationale.",
    },
  ];
}

/**
 * Enforce engine semantics: `completed` implies every task is `done`
 * (per-task acceptance is enforced separately). Blocked tasks use task-level status only.
 */
function validateBlueprintEngineSemantics(
  file: string,
  blueprint: Blueprint,
): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = [];

  if (blueprint.status === "completed") {
    for (const task of blueprint.tasks) {
      if (task.status !== "done" && task.status !== "dropped") {
        issues.push({
          file,
          level: "error",
          message: `Blueprint status is completed but task ${task.id} is "${task.status}" (expected "done" or "dropped").`,
        });
      }
    }
  }

  return issues;
}

function validateOwnerBindingTruth(
  file: string,
  frontmatter: LifecycleAuditFrontmatter,
): BlueprintAuditIssue[] {
  if (frontmatter.type !== "blueprint" || frontmatter.status !== "in-progress") return [];

  const issues: BlueprintAuditIssue[] = [];
  const ownerId =
    typeof frontmatter.worktreeOwnerId === "string" ? frontmatter.worktreeOwnerId.trim() : "";
  const ownerBranch =
    typeof frontmatter.worktreeOwnerBranch === "string"
      ? frontmatter.worktreeOwnerBranch.trim()
      : "";

  if (!ownerId) {
    issues.push({
      file,
      level: "error",
      message:
        "In-progress executable blueprint is missing worktree_owner_id; start or repair it with `wp blueprint start` / `wp worktree rebind`.",
    });
  }

  if (!ownerBranch) {
    issues.push({
      file,
      level: "error",
      message:
        "In-progress executable blueprint is missing worktree_owner_branch; start or repair it with `wp blueprint start` / `wp worktree rebind`.",
    });
  } else if (!ownerBranch.startsWith("bp/")) {
    issues.push({
      file,
      level: "error",
      message: `In-progress blueprint worktree_owner_branch "${ownerBranch}" does not follow the uniform \`bp/<slug>\` convention; create the worktree with \`wp blueprint start <slug>\`.`,
    });
  }

  if (ownerId) {
    const entry = findResolvableOwnerBinding(ownerId);
    if (!entry) {
      issues.push({
        file,
        level: "error",
        message: `In-progress executable blueprint has unresolved owner worktree binding ${ownerId}; run \`wp worktree rebind\` or \`wp worktree adopt\`.`,
      });
    } else if (ownerBranch && entry.branch !== ownerBranch) {
      issues.push({
        file,
        level: "error",
        message: `Owner worktree binding branch mismatch: frontmatter=${ownerBranch} registry=${entry.branch ?? "(none)"}.`,
      });
    }
  }

  return issues;
}

function validateExecutionMetadataTruth(file: string, blueprint: Blueprint): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = [];
  const metadata = readBlueprintExecutionMetadata(blueprint.raw);
  const artifacts = readBlueprintExecutionArtifacts(blueprint.raw);
  const executionFieldCount = Array.from(
    blueprint.raw.matchAll(/^\s*execution_(backend|id|status|updated_at):/gm),
  ).length;
  const executionArtifactFieldCount = Array.from(
    blueprint.raw.matchAll(/^\s*execution_(verifications|artifacts|log_path):/gm),
  ).length;

  if (!metadata) {
    if (executionFieldCount > 0) {
      issues.push({
        file,
        level: "error",
        message:
          "Blueprint execution metadata is partially populated; backend, id, status, and updated_at must all be present together.",
      });
    }
    if (executionArtifactFieldCount > 0) {
      issues.push({
        file,
        level: "error",
        message:
          "Blueprint execution artifacts are populated without canonical execution metadata.",
      });
    }
    return issues;
  }

  if (
    metadata.status === "running" &&
    (blueprint.status === "draft" ||
      blueprint.status === "planned" ||
      blueprint.status === "parked")
  ) {
    issues.push({
      file,
      level: "error",
      message: `Blueprint execution is ${metadata.status} but blueprint status is ${blueprint.status}; runtime-backed work must move the blueprint into in-progress.`,
    });
  }

  if (metadata.status === "completed") {
    const incompleteTasks = blueprint.tasks.filter(
      (task) => task.status !== "done" && task.status !== "dropped",
    );
    if (blueprint.status !== "completed") {
      issues.push({
        file,
        level: "error",
        message: "Blueprint execution is completed but blueprint status is not completed.",
      });
    }
    if (incompleteTasks.length > 0) {
      issues.push({
        file,
        level: "error",
        message: `Blueprint execution is completed but tasks remain unfinished: ${incompleteTasks.map((task) => task.id).join(", ")}.`,
      });
    }
    if (!artifacts || artifacts.verifications.length === 0) {
      issues.push({
        file,
        level: "error",
        message: "Blueprint execution is completed but named verification output is missing.",
      });
    }
    if (!artifacts || (artifacts.artifacts.length === 0 && !artifacts.logPath)) {
      issues.push({
        file,
        level: "error",
        message: "Blueprint execution is completed but artifact or log identity is missing.",
      });
    }
  }

  if (
    (metadata.status === "blocked" ||
      metadata.status === "failed" ||
      metadata.status === "stopped") &&
    blueprint.status === "completed"
  ) {
    issues.push({
      file,
      level: "error",
      message: `Blueprint execution is ${metadata.status} but blueprint is marked completed.`,
    });
  }

  if (
    (metadata.status === "blocked" || metadata.status === "failed") &&
    blueprint.tasks.length > 0 &&
    blueprint.tasks.every((task) => task.status === "done" || task.status === "dropped")
  ) {
    issues.push({
      file,
      level: "error",
      message: `Blueprint execution is ${metadata.status} but every task is marked done/dropped; failed or blocked runtime work must not appear completed.`,
    });
  }

  return issues;
}

const lifecycleTaskStatuses = new Set(["todo", "in-progress", "blocked", "done", "dropped"]);

function validateBlueprintPlacement(file: string, blueprint: Blueprint): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = [];
  const normalized = normalizePath(file);
  // Try both layouts (webpresso legacy + generic).
  const folderStatus =
    normalized.split("/webpresso/blueprints/")[1]?.split("/")[0] ??
    normalized.split("/blueprints/")[1]?.split("/")[0];
  if (!folderStatus) return issues;

  if (!lifecycleBlueprintStatusSchema.safeParse(blueprint.status).success) {
    issues.push({
      file,
      level: "error",
      message: `Blueprint status "${blueprint.status}" is not in the executable lifecycle.`,
    });
    return issues;
  }

  if (folderStatus !== blueprint.status) {
    issues.push({
      file,
      level: "error",
      message: `Blueprint folder/status mismatch: folder=${folderStatus} frontmatter=${blueprint.status}.`,
    });
  }

  return issues;
}

async function auditBlueprintFile(
  file: string,
  slug: string,
  options: Pick<RunBlueprintAuditOptions, "strict">,
): Promise<BlueprintAuditIssue[]> {
  const raw = await readFile(file, "utf-8");
  const blueprint = parseBlueprint(raw, slug);
  const frontmatter = readLifecycleAuditFrontmatter(raw);
  const strictIssues = options.strict
    ? validateCompletedZeroTaskBlueprint(file, frontmatter, countTaskHeadings(raw))
    : [];
  return [
    ...validateBlueprintPlacement(file, blueprint),
    ...validateTaskState(blueprint).map((issue) => Object.assign({}, issue, { file })),
    ...validateBlueprintEngineSemantics(file, blueprint),
    ...strictIssues,
    ...validateApprovalGate(file, frontmatter),
    ...validateOwnerBindingTruth(file, frontmatter),
    ...validateExecutionMetadataTruth(file, blueprint),
  ];
}

function validatePllDocs(docs: Array<{ file: string; raw: string }>): BlueprintAuditIssue[] {
  const issues: BlueprintAuditIssue[] = [];

  for (const doc of docs) {
    if (/just wp blueprint move <slug> in-progress/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: "error",
        message: "PLL docs still instruct direct blueprint move commands for normal execution.",
      });
    }
    if (/just wp blueprint run <slug>/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: "error",
        message: "PLL docs still claim a nonexistent `wp blueprint run` execution surface.",
      });
    }
    if (/blueprint-orchestrator/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: "error",
        message: "PLL docs still reference a removed local blueprint orchestrator.",
      });
    }
    if (/blueprint plans|combined-dag/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: "error",
        message: "PLL docs still reference unshipped cross-blueprint execution commands.",
      });
    }
    if (/TaskUpdate\(taskId=task\.id,\s*status="completed"\)/i.test(doc.raw)) {
      issues.push({
        file: doc.file,
        level: "error",
        message: "PLL docs still mark failed tasks as completed in pseudocode.",
      });
    }
  }

  return issues;
}

async function auditStageCoherence(
  projectRoot: string,
  stagedFiles: string[],
): Promise<BlueprintAuditIssue[]> {
  const normalizedFiles = stagedFiles.map(normalizePath);
  const stagedBlueprints = new Set(normalizedFiles.filter(isBlueprintOverview));
  const stagedCodeFiles = normalizedFiles.filter(
    (file) =>
      !file.startsWith(".agent/") &&
      !isBlueprintOverview(file) &&
      !file.startsWith("webpresso/blueprints/") &&
      !file.startsWith("blueprints/") &&
      !file.endsWith(".md"),
  );

  if (!stagedCodeFiles.length) {
    return [];
  }

  const service = new BlueprintService(projectRoot);
  const active = (
    await service.query({
      filters: { status: ["planned", "in-progress"] },
    })
  ).plans;

  const issues: BlueprintAuditIssue[] = [];
  for (const file of stagedCodeFiles) {
    const matching = active.filter((plan) => plan.filesTouched.includes(file));
    if (!matching.length) {
      continue;
    }

    const matchingPaths = matching.map((plan) =>
      normalizePath(path.relative(projectRoot, plan.path)),
    );
    const hasBlueprintUpdate = matchingPaths.some((planPath) => stagedBlueprints.has(planPath));
    if (hasBlueprintUpdate) {
      continue;
    }

    const blockingMatches = matching.filter((plan) => plan.status === "in-progress");
    if (!blockingMatches.length) {
      issues.push({
        file,
        level: "warning",
        message: `Staged file ${file} matches planned blueprint filesTouched (${matchingPaths.join(", ")}); planned blueprints are advisory until implementation starts.`,
      });
      continue;
    }

    if (isSharedHotFile(file)) {
      // Shared/cross-cutting manifest files (package.json, lockfiles, workspace
      // descriptors) are touched by many independent agents and routinely show
      // up in active blueprints' filesTouched. Demote to a non-blocking warning
      // so unrelated dep bumps and lockfile refreshes aren't gated on a
      // blueprint they happen to overlap with.
      issues.push({
        file,
        level: "warning",
        message: `Shared file ${file} matches blueprint filesTouched (${matchingPaths.join(", ")}); cross-cutting changes don't require a blueprint overview update.`,
      });
      continue;
    }
    const blockingPaths = blockingMatches.map((plan) =>
      normalizePath(path.relative(projectRoot, plan.path)),
    );
    issues.push({
      file,
      level: "error",
      message: `Staged file ${file} matches in-progress blueprint filesTouched (${blockingPaths.join(", ")}) but no corresponding blueprint overview is staged.`,
    });
  }

  return issues;
}

/**
 * Files routinely touched by unrelated dep bumps, lockfile refreshes, and
 * workspace-wide tooling changes. Stage-coherence on these never blocks.
 */
const SHARED_HOT_FILE_PATTERNS: RegExp[] = [
  /(?:^|\/)package\.json$/,
  /^pnpm-workspace\.yaml$/,
  /^pnpm-lock\.yaml$/,
];

function isSharedHotFile(file: string): boolean {
  return SHARED_HOT_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

export async function runBlueprintAudit(
  options: RunBlueprintAuditOptions,
): Promise<BlueprintAuditResult> {
  const issues: BlueprintAuditIssue[] = [];
  const scanned = scanBlueprintDirectory({
    baseDir: resolveBlueprintRoot(options.projectRoot),
    includeSpecialFolders: true,
  });

  const blueprintFiles =
    options.all || !options.stagedFiles
      ? scanned
      : scanned.filter((entry) =>
          new Set(options.stagedFiles?.map(normalizePath) ?? []).has(
            normalizePath(path.relative(options.projectRoot, entry.path)),
          ),
        );

  issues.push(...validateBlueprintSlugUniqueness(blueprintFiles));
  for (const entry of blueprintFiles) {
    issues.push(...(await auditBlueprintFile(entry.path, entry.slug, options)));
  }

  const pllDocs = [
    path.join(options.projectRoot, ".agent", "commands", "pll.md"),
    path.join(options.projectRoot, ".agent", "skills", "pll", "SKILL.md"),
    path.join(options.projectRoot, ".agent", "guides", "parallel-execution.md"),
  ];

  const docsPayload = await Promise.all(
    pllDocs.map(async (file) => {
      try {
        return {
          file,
          raw: await readFile(file, "utf-8"),
        };
      } catch {
        return null;
      }
    }),
  );
  issues.push(
    ...validatePllDocs(
      docsPayload.filter((entry): entry is { file: string; raw: string } => entry !== null),
    ),
  );

  if (options.stagedFiles) {
    issues.push(...(await auditStageCoherence(options.projectRoot, options.stagedFiles)));
  }

  const strictIssues = options.strict ? issues : issues.filter((issue) => issue.level === "error");

  return {
    issues,
    ok: strictIssues.filter((issue) => issue.level === "error").length === 0,
  };
}
