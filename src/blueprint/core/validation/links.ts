/**
 * Validate internal plan links.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Validate internal plan links.
 */
export function validatePlanLinks(
  markdown: string,
  filePath: string,
): { valid: boolean; brokenLinks: string[] } {
  const linkRegex = /\[([^\]]+)\]\((\.\.[^)]+|\.\/[^)]+)\)/g;
  const matches = Array.from(markdown.matchAll(linkRegex));
  const brokenLinks: string[] = [];

  const planDir = dirname(filePath);

  for (const match of matches) {
    const linkPath = match[2];
    if (!linkPath) continue;

    if (linkPath.startsWith("http") || linkPath.startsWith("#")) continue;

    const targetPath = resolve(planDir, linkPath);

    if (!existsSync(targetPath)) {
      brokenLinks.push(linkPath);
    }
  }

  return {
    valid: !brokenLinks.length,
    brokenLinks,
  };
}

/**
 * Check for CHANGELOG.md in completed plans.
 */
export function checkChangelog(filePath: string): { hasChangelog: boolean; warning?: string } {
  if (!filePath.includes("/completed/")) {
    return { hasChangelog: true };
  }

  const planDir = dirname(filePath);
  const changelogPath = join(planDir, "CHANGELOG.md");

  if (!existsSync(changelogPath)) {
    return {
      hasChangelog: false,
      warning: "Completed plan missing CHANGELOG.md (recommended)",
    };
  }

  return { hasChangelog: true };
}
