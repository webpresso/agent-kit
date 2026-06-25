import type { ParsedBlueprintForDb } from "#db/parser/blueprint-db-parser";

import { overviewSection, REVIEW_CHECKLIST, titleLine } from "./_field-map.js";

/**
 * Emit spec.md — Feature Specification with User Scenarios, Requirements, Review Checklist.
 * Pure function, <40 LOC.
 */
export function emitSpec(parsed: ParsedBlueprintForDb): string {
  const sections: string[] = [titleLine(parsed, "Specification"), ""];

  sections.push(overviewSection(parsed), "");

  sections.push("## User Scenarios", "");
  if (parsed.tasks.length === 0) {
    sections.push("_No tasks defined._");
  } else {
    for (const task of parsed.tasks) {
      const criterion = task.acceptanceCriteria[0] ?? task.title;
      sections.push(`- A developer can ${criterion.replace(/^[-*]\s*/, "").toLowerCase()}`);
    }
  }
  sections.push("");

  sections.push("## Requirements", "");
  if (parsed.risks.length === 0) {
    sections.push("_No risks documented._");
  } else {
    sections.push("The system must handle:");
    sections.push("");
    for (const risk of parsed.risks) {
      sections.push(`- **${risk.severity}**: ${risk.description}`);
    }
  }
  sections.push("");

  sections.push(REVIEW_CHECKLIST);

  return sections.join("\n");
}
