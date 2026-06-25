/**
 * Extended Plan Types for Sprint Board Queries
 *
 * Use blueprint-owned query types and guards.
 */

import type { FreshnessScore } from "#tracked-document/query-types";

import {
  planStatusSchema,
  taskStatusSchema,
  type BlueprintStatus,
  type BlueprintTaskStatus,
} from "#core/schema";

export type { FreshnessScore };
export type TaskStatus = BlueprintTaskStatus;

export type Complexity = "XS" | "S" | "M" | "L" | "XL";

export interface BlueprintQuerySummary {
  name: string;
  title: string;
  status: BlueprintStatus;
  complexity?: Complexity;
  taskCount: number;
  tasksCompleted: number;
}

export interface BlueprintRecord extends BlueprintQuerySummary {
  group: string | null;
  path: string;
  lastUpdated: Date;
  freshness: FreshnessScore;
  filesTouched: string[];
}

export interface BlueprintQueryFilters {
  status?: BlueprintStatus | BlueprintStatus[];
  group?: string | string[];
  complexity?: Complexity | Complexity[];
  stale?: boolean;
  staleDays?: number;
  filesTouched?: string[];
}

export type BlueprintSortField = "freshness" | "lastUpdated" | "taskCount" | "name" | "status";
export type SortDirection = "asc" | "desc";

export interface BlueprintSortOptions {
  field: BlueprintSortField;
  direction: SortDirection;
}

export interface BlueprintQueryResult {
  plans: BlueprintRecord[];
  summary: {
    total: number;
    byStatus: Record<string, number>;
    byGroup: Record<string, number>;
    staleCount: number;
    avgFreshness: number;
  };
}

export function isBlueprintStatus(value: string): value is BlueprintStatus {
  return planStatusSchema.options.includes(value as BlueprintStatus);
}

export function isComplexity(value: string): value is Complexity {
  return ["XS", "S", "M", "L", "XL"].includes(value);
}

export function isTaskStatus(value: string): value is TaskStatus {
  return taskStatusSchema.options.includes(value as TaskStatus);
}
