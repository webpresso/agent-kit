import { describe, expect, it } from "vitest";

import {
  serializeMeasurementArtifact,
  validateMeasurementArtifact,
  type MeasurementArtifact,
  type Sample,
} from "./measurement-artifact";

const BASE_SAMPLE: Sample = {
  metricKey: "latency_p50",
  value: 1234,
  unit: "ms",
};

const BASE_ARTIFACT: MeasurementArtifact = {
  schemaVersion: "1",
  runId: "abc123-dirty-20260619T120000Z",
  manifestDigest: "sha256digest12",
  provenance: {
    gitCommit: "abc1234def5678",
    gitDirty: false,
    command: "wp benchmark run --suite smoke",
    environment: "dry_run",
  },
  scenarioSet: "smoke",
  variantSet: "baseline",
  warmup: 2,
  repetitions: 5,
  samples: [BASE_SAMPLE],
  aggregates: { latency_p50: 1234 },
  thresholds: {
    latency_p50: { value: 2000, unit: "ms", pass: true },
  },
  rawArtifactHashes: { "transcript-001.json": "deadbeef1234" },
  redactionStatus: "clean",
};

describe("validateMeasurementArtifact", () => {
  it("accepts a valid artifact and returns it unchanged", () => {
    const result = validateMeasurementArtifact(BASE_ARTIFACT);
    expect(result).toStrictEqual(BASE_ARTIFACT);
  });

  it("throws a descriptive error when provenance.gitCommit is missing", () => {
    const invalid = {
      ...BASE_ARTIFACT,
      provenance: {
        ...BASE_ARTIFACT.provenance,
        gitCommit: "",
      },
    };
    expect(() => validateMeasurementArtifact(invalid)).toThrow(/provenance\.gitCommit/);
  });

  it("throws when samples array is empty", () => {
    const invalid = { ...BASE_ARTIFACT, samples: [] };
    expect(() => validateMeasurementArtifact(invalid)).toThrow(/samples/);
  });

  it("throws when environment is live but samples array is empty", () => {
    const invalid = {
      ...BASE_ARTIFACT,
      provenance: { ...BASE_ARTIFACT.provenance, environment: "live" as const },
      samples: [],
    };
    expect(() => validateMeasurementArtifact(invalid)).toThrow(/samples/);
  });

  it("throws when dry_run environment has no samples", () => {
    const invalid = {
      ...BASE_ARTIFACT,
      provenance: { ...BASE_ARTIFACT.provenance, environment: "dry_run" as const },
      samples: [],
    };
    expect(() => validateMeasurementArtifact(invalid)).toThrow(/samples/);
  });

  it("throws when rawArtifactHashes is missing", () => {
    const invalid = { ...BASE_ARTIFACT, rawArtifactHashes: undefined };
    expect(() => validateMeasurementArtifact(invalid)).toThrow(/rawArtifactHashes/);
  });

  it("throws when provenance.command is empty", () => {
    const invalid = {
      ...BASE_ARTIFACT,
      provenance: { ...BASE_ARTIFACT.provenance, command: "" },
    };
    expect(() => validateMeasurementArtifact(invalid)).toThrow(/provenance\.command/);
  });

  it("throws when the artifact is not an object", () => {
    expect(() => validateMeasurementArtifact(null)).toThrow();
    expect(() => validateMeasurementArtifact("string")).toThrow();
    expect(() => validateMeasurementArtifact(42)).toThrow();
  });

  it("throws when provenance is missing entirely", () => {
    const invalid = { ...BASE_ARTIFACT, provenance: undefined };
    expect(() => validateMeasurementArtifact(invalid)).toThrow(/provenance/);
  });
});

describe("serializeMeasurementArtifact", () => {
  it("is deterministic: two calls on the same object produce identical strings", () => {
    const first = serializeMeasurementArtifact(BASE_ARTIFACT);
    const second = serializeMeasurementArtifact(BASE_ARTIFACT);
    expect(first).toStrictEqual(second);
  });

  it("sorts keys: an artifact with keys out of order serializes identically to one in order", () => {
    // Build an artifact whose top-level keys are in a different insertion order
    const shuffled: MeasurementArtifact = {
      redactionStatus: "clean",
      rawArtifactHashes: { "transcript-001.json": "deadbeef1234" },
      thresholds: { latency_p50: { value: 2000, unit: "ms", pass: true } },
      aggregates: { latency_p50: 1234 },
      samples: [BASE_SAMPLE],
      repetitions: 5,
      warmup: 2,
      variantSet: "baseline",
      scenarioSet: "smoke",
      provenance: {
        environment: "dry_run",
        command: "wp benchmark run --suite smoke",
        gitDirty: false,
        gitCommit: "abc1234def5678",
      },
      manifestDigest: "sha256digest12",
      runId: "abc123-dirty-20260619T120000Z",
      schemaVersion: "1",
    };
    expect(serializeMeasurementArtifact(shuffled)).toStrictEqual(
      serializeMeasurementArtifact(BASE_ARTIFACT),
    );
  });

  it("produces valid JSON output", () => {
    const serialized = serializeMeasurementArtifact(BASE_ARTIFACT);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});
