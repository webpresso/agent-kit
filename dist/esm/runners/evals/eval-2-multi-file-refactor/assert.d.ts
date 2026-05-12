import type { RunnerEvent } from '#runners/types';
export interface AssertResult {
    readonly passed: boolean;
    readonly reason?: string;
}
export declare function assertEval2(events: readonly RunnerEvent[]): Promise<AssertResult>;
//# sourceMappingURL=assert.d.ts.map