import type { SessionContinuityEventType } from './types.js';
export type ContinuityEventType = SessionContinuityEventType;
export interface ContinuityEvent {
    eventType: ContinuityEventType;
    toolName: string;
    content: string;
    summary: string;
    priority?: number;
    metadata?: Record<string, unknown>;
}
export interface BuildContinuityEventInput {
    eventType: ContinuityEventType;
    toolName?: string;
    content: string;
    summary?: string;
    priority?: number;
    metadata?: Record<string, unknown>;
    maxContentBytes?: number;
}
export interface BuildPromptContinuityEventsInput {
    prompt: string;
    maxContentBytes?: number;
}
export declare function buildContinuityEvent(input: BuildContinuityEventInput): ContinuityEvent;
export declare function buildPromptContinuityEvents(input: BuildPromptContinuityEventsInput): ContinuityEvent[];
//# sourceMappingURL=hook-capture.d.ts.map