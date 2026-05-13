/**
 * Blueprint Parser
 *
 * Blueprint parser/types are owned locally so the package can keep its
 * schema contract and parsing behavior self-contained.
 */
import { type BlueprintTaskStatus } from '#core/schema';
export type TaskStatusValue = BlueprintTaskStatus;
export interface AcceptanceCriteria {
    total: number;
    checked: number;
}
export interface Task {
    id: string;
    title: string;
    status: BlueprintTaskStatus;
    statusExplicit?: boolean;
    depends?: string[];
    blockedReason?: string;
    acceptanceCriteria: AcceptanceCriteria;
    description?: string;
    stepType: string;
    targetPackage?: string;
    targetFile?: string;
    complexity?: string;
}
export interface Phase {
    number: number;
    title: string;
    complexity: string;
    tasks: Task[];
}
export interface Blueprint {
    name: string;
    type: 'blueprint' | 'parent-roadmap';
    title: string;
    status: string;
    complexity: string;
    description?: string;
    lastUpdated: string;
    created?: string;
    progress?: string;
    completedAt?: string;
    parentRoadmap?: string;
    dependsOn?: string[];
    tags?: string[];
    tasks: Task[];
    phases: Phase[];
    raw: string;
}
export declare function parseBlueprint(markdown: string, name: string): Blueprint;
export declare function serializeBlueprint(blueprint: Blueprint): string;
//# sourceMappingURL=parser.d.ts.map