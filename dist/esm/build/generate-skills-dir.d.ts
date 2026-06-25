#!/usr/bin/env bun
/**
 * generate-skills-dir.ts
 *
 * Reads catalog/agent/skills/<name>/SKILL.md and writes
 * skills/<slug>/SKILL.md at the package root.
 *
 * Slug sanitization: spaces and non-alphanumeric chars become `-`;
 * leading/trailing dashes are stripped; output is lowercased.
 *
 * Exits non-zero if a slug collision is detected.
 */
export {};
//# sourceMappingURL=generate-skills-dir.d.ts.map