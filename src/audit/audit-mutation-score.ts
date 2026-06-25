/**
 * Audit: Mutation Score Gate
 *
 * Pure over the JSON data — no filesystem reads.
 * Verifies:
 *   - Covered mutation score (killed / (killed+survived)) ≥ minCovered
 *   - Raw mutation score (killed / (killed+survived+noCoverage)) ≥ minRaw
 *   - Every file with ≥ minMutantsForFileGate mutants scores ≥ minFile
 */

import type { RepoAuditResult } from "#audit/repo-guardrails";

export interface MutantEntry {
  status: "Killed" | "Survived" | "NoCoverage" | "Ignored" | "Timeout" | "RuntimeError";
}

export interface MutationReportFile {
  mutants: MutantEntry[];
}

export interface MutationReport {
  files: Record<string, MutationReportFile>;
}

export interface MutationScoreOptions {
  minCovered?: number;
  minRaw?: number;
  minFile?: number;
  minMutantsForFileGate?: number;
}

const DEFAULTS: Required<MutationScoreOptions> = {
  minCovered: 95,
  minRaw: 90,
  minFile: 85,
  minMutantsForFileGate: 10,
};

function pct(num: number, denom: number): number {
  return denom === 0 ? 100 : (num / denom) * 100;
}

export interface MutationScoreSummary {
  coveredScore: number;
  rawScore: number;
  totalKilled: number;
  totalSurvived: number;
  totalNoCoverage: number;
}

export function computeMutationScores(report: MutationReport): MutationScoreSummary & {
  perFile: Array<{
    path: string;
    killed: number;
    survived: number;
    noCoverage: number;
    score: number;
  }>;
} {
  let totalKilled = 0;
  let totalSurvived = 0;
  let totalNoCoverage = 0;
  const perFile: Array<{
    path: string;
    killed: number;
    survived: number;
    noCoverage: number;
    score: number;
  }> = [];

  for (const [path, fileData] of Object.entries(report.files)) {
    let killed = 0;
    let survived = 0;
    let noCoverage = 0;
    for (const m of fileData.mutants) {
      if (m.status === "Killed" || m.status === "Timeout") killed++;
      else if (m.status === "Survived") survived++;
      else if (m.status === "NoCoverage") noCoverage++;
    }
    totalKilled += killed;
    totalSurvived += survived;
    totalNoCoverage += noCoverage;
    perFile.push({
      path,
      killed,
      survived,
      noCoverage,
      score: pct(killed, killed + survived + noCoverage),
    });
  }

  return {
    coveredScore: pct(totalKilled, totalKilled + totalSurvived),
    rawScore: pct(totalKilled, totalKilled + totalSurvived + totalNoCoverage),
    totalKilled,
    totalSurvived,
    totalNoCoverage,
    perFile,
  };
}

export function auditMutationScore(
  report: MutationReport,
  options: MutationScoreOptions = {},
): RepoAuditResult {
  const { minCovered, minRaw, minFile, minMutantsForFileGate } = { ...DEFAULTS, ...options };
  const { coveredScore, rawScore, totalKilled, totalSurvived, totalNoCoverage, perFile } =
    computeMutationScores(report);

  const violations: RepoAuditResult["violations"] = [];

  for (const f of perFile) {
    const fileMutants = f.killed + f.survived + f.noCoverage;
    if (fileMutants >= minMutantsForFileGate && f.score < minFile) {
      violations.push({
        file: f.path,
        message: `[mutation-score-per-file] ${f.score.toFixed(1)}% < ${minFile}% (${f.killed} killed, ${f.survived} survived, ${f.noCoverage} no-cov)`,
      });
    }
  }

  if (coveredScore < minCovered) {
    violations.push({
      message: `[mutation-score-covered] ${coveredScore.toFixed(2)}% < ${minCovered}% (${totalKilled} killed, ${totalSurvived} survived)`,
    });
  }

  if (rawScore < minRaw) {
    violations.push({
      message: `[mutation-score-raw] ${rawScore.toFixed(2)}% < ${minRaw}% — ${totalNoCoverage} no-coverage mutants drag it down`,
    });
  }

  if (totalNoCoverage > 0) {
    violations.push({
      message: `[mutation-score-no-cov] ${totalNoCoverage} mutants have no test coverage`,
    });
  }

  const hasFileViolations = perFile.some(
    (f) => f.killed + f.survived + f.noCoverage >= minMutantsForFileGate && f.score < minFile,
  );

  return {
    ok: coveredScore >= minCovered && rawScore >= minRaw && !hasFileViolations,
    title: `Mutation score: covered=${coveredScore.toFixed(1)}%, raw=${rawScore.toFixed(1)}%`,
    checked: perFile.length,
    violations,
  };
}
