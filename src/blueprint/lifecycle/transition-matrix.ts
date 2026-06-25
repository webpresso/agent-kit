import { lifecycleBlueprintStatusSchema } from "#core/schema.js";

import type { LifecycleBlueprintStatus } from "#core/schema.js";

const LEGAL_TRANSITIONS = {
  draft: ["planned", "completed", "archived"],
  planned: ["in-progress", "completed", "parked", "archived"],
  "in-progress": ["completed", "parked", "archived"],
  parked: ["in-progress", "planned", "archived"],
  completed: ["in-progress", "archived"],
  archived: [],
} as const satisfies Record<LifecycleBlueprintStatus, readonly LifecycleBlueprintStatus[]>;

export function parseLifecycleBlueprintStatus(value: string): LifecycleBlueprintStatus | null {
  const parsed = lifecycleBlueprintStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getLegalLifecycleTargets(
  from: LifecycleBlueprintStatus,
): readonly LifecycleBlueprintStatus[] {
  return LEGAL_TRANSITIONS[from];
}

export function isLegalLifecycleTransition(
  from: LifecycleBlueprintStatus,
  to: LifecycleBlueprintStatus,
): boolean {
  return getLegalLifecycleTargets(from).includes(to);
}
