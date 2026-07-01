import { GAIN_PRECISION, } from "#session-memory/gain-types.js";
import { SessionMemoryStore } from "#session-memory/store.js";
import { createSummaryResult } from "./_shared/result.js";
const MAX_GAIN_SIZING_ITERATIONS = 5;
const NON_CONVERGENCE_WARNING = "gain telemetry sizing did not converge after 5 iterations; omitted gain for this call";
export function utf8ByteLength(value) {
    return Buffer.byteLength(value, "utf8");
}
export function measureToolResultBytes(result) {
    return utf8ByteLength(JSON.stringify(result));
}
export function createGainSummaryResult(payload, resultOptions = {}, gainOptions) {
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
function telemetryFor(rawBasisBytes, returnedToolResultBytes, rawBytesBasis) {
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
function normalizeBytes(value) {
    if (!Number.isFinite(value) || value <= 0)
        return 0;
    return Math.trunc(value);
}
function withWarning(payload, warning) {
    const existing = Array.isArray(payload.warnings)
        ? payload.warnings.filter((item) => typeof item === "string")
        : [];
    return { ...payload, warnings: [...existing, warning] };
}
function recordGainEvent(gainOptions, gain) {
    if (gainOptions.recordGainEvent) {
        gainOptions.recordGainEvent(gain);
        return;
    }
    const store = new SessionMemoryStore(gainOptions.dbPath);
    try {
        store.recordGainEvent({ ...gain, toolName: gainOptions.toolName });
    }
    finally {
        store.close();
    }
}
//# sourceMappingURL=_session-gain.js.map