/**
 * Check acceptance criteria completion in plan markdown.
 */

import type { CriteriaResult } from "#core/types";

export function checkAcceptanceCriteria(markdown: string): CriteriaResult {
  const criteriaRegex = /^- \[([ x])\]/gm;
  const matches = Array.from(markdown.matchAll(criteriaRegex));

  const total = matches.length;
  const checked = matches.filter((m) => m[1] === "x").length;

  return {
    total,
    checked,
    allChecked: total === 0 || checked === total,
  };
}
