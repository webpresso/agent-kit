import type { ToolHandlerResult } from "#mcp/auto-discover";
import {
  GAIN_PRECISION,
  type RawBytesBasis,
  type SessionGainTelemetry,
} from "#session-memory/gain-types.js";
import { SessionMemoryStore } from "#session-memory/store.js";
import { createSummaryResult, type SummaryFirstPayload } from "./_shared/result.js";

const MAX_GAIN_SIZING_ITERATIONS = 5;
const NON_CONVERGENCE_WARNING =
  "gain telemetry sizing did not converge after 5 iterations; omitted gain for this call";

export interface SessionGainOptions {
  readonly toolName: string;
  readonly dbPath: string;
  readonly rawBasisBytes: number;
  readonly rawBytesBasis: RawBytesBasis;
  readonly measureResultBytes?: (result: ToolHandlerResult) => number;
  readonly recordGainEvent?: (gain: SessionGainTelemetry) => void;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function measureToolResultBytes(result: ToolHandlerResult): number {
  return utf8ByteLength(JSON.stringify(result));
}

export function createGainSummaryResult<TPayload extends SummaryFirstPayload>(
  payload: TPayload,
  resultOptions: { isError?: boolean; text?: string } = {},
  gainOptions: SessionGainOptions,
): ToolHandlerResult {
  const rawBasisBytes = normalizeBytes(gainOptions.rawBasisBytes);
  let returnedToolResultBytes = 0;
  const measure = gainOptions.measureResultBytes ?? measureToolResultBytes;

  for (let iteration = 0; iteration < MAX_GAIN_SIZING_ITERATIONS; iteration += 1) {
    const gain = telemetryFor(rawBasisBytes, returnedToolResultBytes, gainOptions.rawBytesBasis);
    const candidate = createSummaryResult({ ...payload, gain }, resultOptions);
    const measuredBytes = measure(candidate);
    if (measuredBytes === returnedToolResultBytes) {
      recordGainEvent(gainOptions, gain);
      return candidate;
    }
    returnedToolResultBytes = measuredBytes;
  }

  return createSummaryResult(withWarning(payload, NON_CONVERGENCE_WARNING), resultOptions);
}

function telemetryFor(
  rawBasisBytes: number,
  returnedToolResultBytes: number,
  rawBytesBasis: RawBytesBasis,
): SessionGainTelemetry {
  const gainBytes = Math.max(0, rawBasisBytes - returnedToolResultBytes);
  return {
    rawBasisBytes,
    returnedToolResultBytes,
    gainBytes,
    approxTokensSaved: Math.floor(gainBytes / 4),
    precision: GAIN_PRECISION,
    rawBytesBasis,
  };
}

function normalizeBytes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function withWarning<TPayload extends SummaryFirstPayload>(
  payload: TPayload,
  warning: string,
): TPayload & { warnings: string[] } {
  const existing = Array.isArray(payload.warnings)
    ? payload.warnings.filter((item): item is string => typeof item === "string")
    : [];
  return { ...payload, warnings: [...existing, warning] };
}

function recordGainEvent(gainOptions: SessionGainOptions, gain: SessionGainTelemetry): void {
  if (gainOptions.recordGainEvent) {
    gainOptions.recordGainEvent(gain);
    return;
  }
  const store = new SessionMemoryStore(gainOptions.dbPath);
  try {
    store.recordGainEvent({ ...gain, toolName: gainOptions.toolName });
  } finally {
    store.close();
  }
}
