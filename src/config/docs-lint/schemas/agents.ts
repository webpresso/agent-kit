import { z } from "zod";

import { baseFrontmatter, dateString } from "./common.js";

/**
 * Frontmatter schema for agent-guide.md (Single Source of Truth, formerly AGENTS.md)
 */
export const agentsFrontmatter = baseFrontmatter.extend({
  type: z.literal("agents").optional(),

  /** Last update date (critical for freshness gates) */
  last_updated: dateString,

  /** Version of the agent instructions */
  version: z.string().optional(),
});

export type AgentsFrontmatter = z.infer<typeof agentsFrontmatter>;

/**
 * Required sections for agent-guide.md to prevent structure drift.
 */
export const agentsSections = [
  "Critical Rules",
  "Documentation Governance (CRITICAL)",
  "Audit Commands",
];

/**
 * Frontmatter schema for agent entry points (CLAUDE.md).
 * These are pointer files and have lighter validation.
 */
export const agentEntryFrontmatter = baseFrontmatter.extend({
  type: z.literal("agent-entry").optional(),
  last_updated: dateString.optional(),
});

export type AgentEntryFrontmatter = z.infer<typeof agentEntryFrontmatter>;
