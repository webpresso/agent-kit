/**
 * execution-state.ts — pure evidence/artifact state composition.
 *
 * Zero I/O. Functions take plain data and return plain data.
 * Tested by execution-state.test.ts.
 */

import type { BlueprintExecutionArtifacts } from "#index";

import { uniqueStrings } from "./execution-spec.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlueprintExecutionCompletionEvidence {
  artifacts: string[];
  logPath?: string;
  verifications: string[];
}

// ---------------------------------------------------------------------------
// Pure evidence composers
// ---------------------------------------------------------------------------

export function normalizeEvidenceArray(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

export function normalizeCompletionEvidence(
  evidence: BlueprintExecutionCompletionEvidence,
): BlueprintExecutionArtifacts {
  return {
    artifacts: normalizeEvidenceArray(evidence.artifacts),
    logPath: evidence.logPath?.trim() || undefined,
    verifications: normalizeEvidenceArray(evidence.verifications),
  };
}

export function mergeExecutionArtifacts(
  current: BlueprintExecutionArtifacts | null,
  next: BlueprintExecutionCompletionEvidence,
): BlueprintExecutionArtifacts {
  const normalized = normalizeCompletionEvidence(next);
  return {
    artifacts: uniqueStrings([...(current?.artifacts ?? []), ...normalized.artifacts]),
    logPath: normalized.logPath ?? current?.logPath,
    verifications: uniqueStrings([...(current?.verifications ?? []), ...normalized.verifications]),
  };
}

export function assertCompletionEvidence(
  evidence: BlueprintExecutionArtifacts | null,
  executionId: string,
): BlueprintExecutionArtifacts {
  if (!evidence || evidence.verifications.length === 0) {
    throw new Error(
      `Blueprint execution ${executionId} cannot record completion without named verification output.`,
    );
  }

  if (evidence.artifacts.length === 0 && !evidence.logPath) {
    throw new Error(
      `Blueprint execution ${executionId} cannot record completion without artifact or log identity.`,
    );
  }

  return evidence;
}
