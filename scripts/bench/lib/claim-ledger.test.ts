import { describe, expect, it } from "vitest";

import {
  EVIDENCE_TYPES,
  isEvidenceCompatibleWithScope,
  validateClaimLedger,
  type ClaimLedgerEntry,
  type ClaimScope,
  type EvidenceType,
} from "./claim-ledger";

const BASE_ENTRY: ClaimLedgerEntry = {
  requirement_id: "REQ-001",
  claim: "Fixed-suite dry-run validates threshold schema.",
  claim_scope: "fixed_suite_scientific",
  evidence_type: "dry_run",
  validity_status: "valid",
  provider: "none",
  source_provenance: "scripts/bench/scenarios/_schema.test.ts",
  test_ids: ["bench scenario schema"],
  artifact_paths: [],
};

const EXPECTED_COMPATIBILITY: Record<ClaimScope, Record<EvidenceType, boolean>> = {
  fixed_suite_scientific: {
    deterministic_test: true,
    dry_run: true,
    mutation: true,
    fixture_conformance: true,
    live_conformance: false,
    diagnostic_hook: false,
    manual_note: false,
  },
  provider_conformance: {
    deterministic_test: true,
    dry_run: false,
    mutation: false,
    fixture_conformance: true,
    live_conformance: true,
    diagnostic_hook: false,
    manual_note: false,
  },
  diagnostic: {
    deterministic_test: true,
    dry_run: true,
    mutation: false,
    fixture_conformance: false,
    live_conformance: false,
    diagnostic_hook: false,
    manual_note: false,
  },
};

describe("claim-ledger evidence matrix", () => {
  it("pins the complete closed compatibility matrix for every evidence type and scope", () => {
    expect(EVIDENCE_TYPES).toEqual([
      "deterministic_test",
      "dry_run",
      "mutation",
      "fixture_conformance",
      "live_conformance",
      "diagnostic_hook",
      "manual_note",
    ]);

    for (const [scope, evidenceMap] of Object.entries(EXPECTED_COMPATIBILITY) as Array<
      [ClaimScope, Record<EvidenceType, boolean>]
    >) {
      for (const evidenceType of EVIDENCE_TYPES) {
        expect(isEvidenceCompatibleWithScope(evidenceType, scope), `${scope}:${evidenceType}`).toBe(
          evidenceMap[evidenceType],
        );
      }
    }
  });

  it("accepts deterministic evidence for fixed-suite scientific claims", () => {
    expect(() => validateClaimLedger([BASE_ENTRY])).not.toThrow();
    expect(() =>
      validateClaimLedger([
        { ...BASE_ENTRY, evidence_type: "mutation" },
        { ...BASE_ENTRY, evidence_type: "fixture_conformance" },
      ]),
    ).not.toThrow();
  });

  it("rejects hook, manual, and live observations as fixed-suite scientific evidence", () => {
    for (const evidenceType of ["diagnostic_hook", "manual_note", "live_conformance"] as const) {
      expect(() =>
        validateClaimLedger([
          {
            ...BASE_ENTRY,
            evidence_type: evidenceType,
            validity_status: evidenceType === "live_conformance" ? "valid" : "diagnostic_only",
          },
        ]),
      ).toThrow(new RegExp(`${evidenceType} cannot support fixed_suite_scientific`));
    }
  });

  it("keeps live evidence scoped to provider conformance, not fixed-suite proof", () => {
    expect(() =>
      validateClaimLedger([
        {
          ...BASE_ENTRY,
          claim_scope: "provider_conformance",
          evidence_type: "live_conformance",
          provider: "codex",
        },
      ]),
    ).not.toThrow();
  });

  it("fails closed on missing required ledger fields and whitespace-only values", () => {
    const invalidCases: Array<[string, ClaimLedgerEntry, RegExp]> = [
      ["requirement_id", { ...BASE_ENTRY, requirement_id: "   " }, /missing requirement_id/],
      ["claim", { ...BASE_ENTRY, claim: "\t" }, /missing claim/],
      ["source_provenance", { ...BASE_ENTRY, source_provenance: " " }, /missing source_provenance/],
      ["test_ids", { ...BASE_ENTRY, test_ids: [] }, /missing test_ids/],
    ];

    for (const [name, entry, expected] of invalidCases) {
      expect(() => validateClaimLedger([entry]), name).toThrow(expected);
    }
  });
});
