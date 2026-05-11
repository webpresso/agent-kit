import type { AgentPersona } from './types.js';
export interface AgentContribution {
    persona: AgentPersona;
    content: string;
    position?: 'approve' | 'reject' | 'abstain' | 'needs_clarification';
    confidence?: number;
    keyPoints?: string[];
    timestamp: Date;
}
export interface DebateRound {
    roundNumber: number;
    topic: string;
    contributions: AgentContribution[];
    summary?: string;
}
export interface DebateOutcome {
    consensusReached: boolean;
    decision: 'approved' | 'rejected' | 'needs_more_info' | 'escalate_to_human';
    confidence: number;
    summary: string;
    agreements: string[];
    disagreements: string[];
    actionItems?: string[];
    votes: Record<AgentPersona, 'approve' | 'reject' | 'abstain' | 'needs_clarification'>;
}
export type DebateType = 'feature_review' | 'bug_priority' | 'technical_decision' | 'sprint_planning' | 'user_story_refinement';
export interface DebateConfig {
    type: DebateType;
    topic: string;
    context?: string;
    maxRounds?: number;
    consensusThreshold?: number;
    participants?: AgentPersona[];
    useModerator?: boolean;
    moderator?: AgentPersona;
    verbose?: boolean;
}
export declare const DEFAULT_DEBATE_CONFIG: Required<Omit<DebateConfig, 'type' | 'topic' | 'context'>>;
export interface DebateState {
    id: string;
    config: DebateConfig;
    rounds: DebateRound[];
    status: 'in_progress' | 'consensus_reached' | 'max_rounds_exceeded' | 'escalated';
    outcome?: DebateOutcome;
    startedAt: Date;
    completedAt?: Date;
}
export declare const DEBATE_PROMPTS: {
    readonly initialPrompt: (config: DebateConfig, persona: AgentPersona) => string;
    readonly followUpPrompt: (config: DebateConfig, persona: AgentPersona, previousRound: DebateRound) => string;
    readonly moderatorPrompt: (config: DebateConfig, state: DebateState) => string;
};
export declare function parsePosition(text: string): 'approve' | 'reject' | 'abstain' | 'needs_clarification';
export declare function parseConfidence(text: string): number;
export declare function calculateConsensus(contributions: AgentContribution[]): {
    hasConsensus: boolean;
    majorityPosition: 'approve' | 'reject' | 'abstain' | 'needs_clarification';
    percentAgreement: number;
    averageConfidence: number;
};
export declare function generateDebateId(): string;
export declare function createDebateState(config: DebateConfig): DebateState;
export declare function addContribution(state: DebateState, contribution: AgentContribution): DebateState;
export declare function startNewRound(state: DebateState, topic?: string): DebateState;
export declare function finalizeDebate(state: DebateState, outcome: DebateOutcome): DebateState;
export declare function shouldContinueDebate(state: DebateState): boolean;
//# sourceMappingURL=persona-debate.d.ts.map