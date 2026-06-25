import type { TrustDossier, TrustDossierViolation } from "./dossier.js";

const BANNED = /\b(TBD|TODO)\b|\bdecide during implementation\b|\bopen question\b|<[^>]+>/u;
const TASK_BANNED = /\b(TBD|TODO)\b|\bdecide during implementation\b|\bopen question\b/u;

export function validateTrustAmbiguity(
  dossier: TrustDossier,
  markdown?: string,
): TrustDossierViolation[] {
  const violations: TrustDossierViolation[] = [];
  const checks: Array<[string, string, string | undefined]> = [
    ["Residual Unknowns", dossier.residualUnknowns, undefined],
    ...dossier.decisions.flatMap((d) => [
      ["Material Decisions", d.decision, d.id] as [string, string, string],
      ["Material Decisions", d.chosenOption, d.id] as [string, string, string],
      ["Material Decisions", d.rationale, d.id] as [string, string, string],
    ]),
    ...dossier.gates.flatMap((g) => [
      ["Promotion Gates", g.command, g.gate] as [string, string, string],
      ["Promotion Gates", g.expectedOutcome, g.gate] as [string, string, string],
      ["Promotion Gates", g.lastResult, g.gate] as [string, string, string],
    ]),
  ];
  for (const [section, value, claimId] of checks) {
    if (BANNED.test(value))
      violations.push({
        section,
        claimId,
        message: "unresolved ambiguity is not allowed in executable trust sections",
      });
  }
  if (dossier.residualUnknowns.trim() !== "None.")
    violations.push({
      section: "Residual Unknowns",
      message: "Residual Unknowns must be exactly `None.`",
    });
  if (markdown) {
    for (const block of extractTaskBlocks(markdown)) {
      if (TASK_BANNED.test(block)) {
        violations.push({
          section: "Tasks",
          message: "unresolved ambiguity is not allowed in executable task sections",
        });
        break;
      }
    }
  }
  return violations;
}

function extractTaskBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of markdown.split("\n")) {
    if (/^#{3,6}\s+Task\b/iu.test(line)) {
      if (current) blocks.push(current.join("\n"));
      current = [line];
      continue;
    }
    if (current && /^#{1,3}\s+/u.test(line)) {
      blocks.push(current.join("\n"));
      current = null;
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current.join("\n"));
  return blocks;
}
