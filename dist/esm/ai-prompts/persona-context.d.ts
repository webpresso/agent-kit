import type { AgentPersona } from './types.js';
export interface BusinessContext {
    mrr?: number;
    arr?: number;
    mau?: number;
    dau?: number;
    cac?: number;
    ltv?: number;
    churnRate?: number;
    conversionRate?: number;
    growth?: {
        mrrGrowth?: number;
        userGrowth?: number;
        period?: string;
    };
    competitors?: string[];
    priorities?: string[];
}
export interface ProductContext {
    nps?: number;
    csat?: number;
    feedbackThemes?: Array<{
        theme: string;
        count: number;
        sentiment: 'positive' | 'neutral' | 'negative';
    }>;
    featureRequests?: Array<{
        title: string;
        votes: number;
        status: 'open' | 'planned' | 'in_progress' | 'completed';
    }>;
    funnelMetrics?: Array<{
        step: string;
        dropOffRate: number;
    }>;
    accessibilityScore?: number;
    supportThemes?: string[];
    userPersonas?: string[];
}
export interface EngineeringContext {
    testCoverage?: number;
    lintErrors?: number;
    typeErrors?: number;
    techDebt?: Array<{
        description: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        file?: string;
    }>;
    vulnerabilities?: Array<{
        package: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        fixAvailable: boolean;
    }>;
    errorRate?: number;
    performance?: {
        p50Latency?: number;
        p95Latency?: number;
        p99Latency?: number;
    };
    buildStatus?: 'passing' | 'failing' | 'unknown';
    openPRs?: number;
}
export interface PersonaContext {
    business?: BusinessContext;
    product?: ProductContext;
    engineering?: EngineeringContext;
}
export declare function formatPersonaContext(persona: AgentPersona, context: PersonaContext): string | undefined;
export declare function getPersonaContextHeader(persona: AgentPersona): string;
//# sourceMappingURL=persona-context.d.ts.map