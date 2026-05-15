import type { AgentPersona } from './types.js';
export interface TaskContext {
    title: string;
    description: string;
    projectName: string;
    priority?: 'critical' | 'high' | 'medium' | 'low';
    complexity?: 'XS' | 'S' | 'M' | 'L' | 'XL';
    status?: string;
    assignee?: string;
    sprintName?: string;
    labels?: string[];
    relatedTasks?: Array<{
        title: string;
        status: string;
    }>;
}
export interface SuggestedFields {
    business_impact?: string;
    priority?: 'critical' | 'high' | 'medium' | 'low';
    revenue_metric?: string;
    user_story?: string;
    acceptance_criteria?: string[];
    ux_considerations?: string;
    complexity?: 'XS' | 'S' | 'M' | 'L' | 'XL';
    technical_approach?: string;
    files_affected?: string[];
    technical_risks?: string[];
    test_strategy?: string;
    coverage_needs?: string;
    quality_gates?: string[];
    infrastructure_needs?: string;
    scaling_considerations?: string;
    devops_requirements?: string[];
    sustainability?: string;
    b2b_implications?: string;
    maintenance_notes?: string;
}
export interface TaskAnalysisResponse {
    summary: string;
    suggestedFields: SuggestedFields;
    risks: string[];
    recommendations: string[];
}
export declare const TASK_ANALYSIS_PROMPTS: Record<AgentPersona, string>;
export declare function buildTaskAnalysisPrompt(agentId: string, task: TaskContext): string;
export declare function parseTaskAnalysisResponse(response: string): TaskAnalysisResponse | null;
export declare const AGENT_FOCUS_AREAS: Record<AgentPersona, string[]>;
export declare const AGENT_SUGGESTED_FIELDS: Record<AgentPersona, (keyof SuggestedFields)[]>;
//# sourceMappingURL=task-analysis.d.ts.map