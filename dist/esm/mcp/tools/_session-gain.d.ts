import type { ToolHandlerResult } from "#mcp/auto-discover";
import { type RawBytesBasis, type SessionGainTelemetry } from "#session-memory/gain-types.js";
import { type SummaryFirstPayload } from "./_shared/result.js";
export interface SessionGainOptions {
    readonly toolName: string;
    readonly dbPath: string;
    readonly rawBasisBytes: number;
    readonly rawBytesBasis: RawBytesBasis;
    readonly measureResultBytes?: (result: ToolHandlerResult) => number;
    readonly recordGainEvent?: (gain: SessionGainTelemetry) => void;
}
export declare function utf8ByteLength(value: string): number;
export declare function measureToolResultBytes(result: ToolHandlerResult): number;
export declare function createGainSummaryResult<TPayload extends SummaryFirstPayload>(payload: TPayload, resultOptions: {
    isError?: boolean;
    text?: string;
} | undefined, gainOptions: SessionGainOptions): ToolHandlerResult;
//# sourceMappingURL=_session-gain.d.ts.map