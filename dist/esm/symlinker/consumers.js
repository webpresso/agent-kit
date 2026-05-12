/**
 * Default consumer configurations for the symlinker.
 *
 * Consumers are tool-specific directories that mirror the canonical source of
 * truth under `.agent/` via symlinks. Each consumer entry describes a single
 * directory and the relative prefix used when creating symlinks from that
 * directory back into `.agent/`.
 *
 * Primary IDEs (Claude Code, Codex, Cursor, Windsurf, OpenCode) are handled by
 * their documented native surfaces:
 *   - Codex skills: `.agents/skills/` (plus user/global roots), covered by
 *     DEFAULT_PER_SKILL_CONSUMERS. `.codex/agents/` is not a skill root.
 *   - Claude Code skills: `.claude/skills/` and plugin distribution.
 *   - Cursor / Windsurf: agent-kit-localskills-distribution (localskills.sh)
 *     plus copied rules/skills below where the tools need project files.
 *   - OpenCode skills: `.opencode/skills/`, `.claude/skills/`, and
 *     `.agents/skills/`. Agent-kit writes `.agents/skills/` and `.claude/skills/`
 *     so OpenCode sees the same core capabilities without extra aliases.
 *     Rules surface: opencode reads `AGENTS.md` directly from the repo root; no
 *     symlinker consumer needed.
 *
 * Gemini's TOML surface is handled separately by `syncGeminiCommands`
 * (not symlink-based), so it is intentionally excluded from
 * `DEFAULT_UNIFIED_CONSUMERS`.
 *
 * The `UNIFIED_CONSUMERS` registry below describes per-IDE projection of the
 * unified rule/skill content kinds (catalog ∪ consumer). Strategies:
 *   - 'symlink':   create a relative symlink to the source (file or dir)
 *   - 'copy':      copy file or recursively copy dir tree
 *   - 'transform': run a transform function over the body and write the
 *                  resulting bytes (used for Gemini TOML)
 */
export const DEFAULT_CONSUMERS = [
// Primary IDEs removed — distributed via native channels (plugin / localskills.sh).
// Intentionally NOT mapped: `.codex/prompts/`. OpenAI deprecated Codex
// custom prompts in favour of skills, and the surface was home-only
// (~/.codex/prompts/) even before deprecation — project-local
// `.codex/prompts/` is never discovered by Codex.
// See https://developers.openai.com/codex/custom-prompts
];
export const ALLOWED_REAL_FILES = new Set(['README.md', '.markdownlint.json']);
export const DEFAULT_SKILLS_CONSUMERS = [
// .claude/skills removed — covered by the Claude Code plugin (primary channel).
];
export const DEFAULT_PER_SKILL_CONSUMERS = [
    {
        dir: '.agents/skills',
    },
];
/**
 * Default-output filename for a rule record under a given consumer.
 * Pure helper — no I/O — so tests can assert it directly.
 */
export function unifiedRuleFilename(consumer, slug) {
    const ext = consumer.ruleExtension ?? '.md';
    return `${slug}${ext}`;
}
/**
 * Default registry of unified consumers (rules + skills projection).
 *
 * Per the Wave 2 task plan:
 *   - `.agent/{rules,skills}/` (working dir): symlink, accepts rule + skill
 *   - `.cursor/rules/`: copy, accepts rule (Cursor follows symlinks unreliably)
 *   - `.windsurf/skills/`: copy, accepts skill
 *   - `.claude/rules/`: symlink, accepts rule
 *   - `.claude/skills/`: symlink, accepts skill
 * Codex intentionally has no `.codex/agents/` consumer. Official Codex skill
 * discovery is `.agents/skills/`, `~/.agents/skills`, and `/etc/codex/skills`.
 */
export const DEFAULT_UNIFIED_CONSUMERS = [
    // Working dir: split into rules/ and skills/ siblings under .agent/
    { id: 'agent-rules', dir: '.agent/rules', acceptsKind: 'rule', strategy: 'symlink' },
    { id: 'agent-skills', dir: '.agent/skills', acceptsKind: 'skill', strategy: 'symlink' },
    // Cursor: rules only, copy, .mdc extension
    {
        id: 'cursor-rules',
        dir: '.cursor/rules',
        acceptsKind: 'rule',
        strategy: 'copy',
        ruleExtension: '.mdc',
    },
    // Windsurf: skills only, copy
    { id: 'windsurf-skills', dir: '.windsurf/skills', acceptsKind: 'skill', strategy: 'copy' },
    // Claude: rules are scaffolded to .claude/rules; skills remain under .claude/skills.
    { id: 'claude-rules', dir: '.claude/rules', acceptsKind: 'rule', strategy: 'symlink' },
    { id: 'claude-skills', dir: '.claude/skills', acceptsKind: 'skill', strategy: 'symlink' },
];
//# sourceMappingURL=consumers.js.map