/**
 * Default consumer configurations for the symlinker.
 *
 * Consumers are tool-specific directories that mirror the canonical source of
 * truth under `.agent/` via symlinks. Each consumer entry describes a single
 * directory and the relative prefix used when creating symlinks from that
 * directory back into `.agent/`.
 *
 * Primary IDEs (Claude Code, Cursor, Windsurf, OpenCode) are no longer handled
 * by the symlinker — they distribute skills via native channels:
 *   - Claude Code: agent-kit-as-claude-code-plugin (marketplace plugin)
 *   - Cursor / Windsurf: agent-kit-localskills-distribution (localskills.sh)
 *   - OpenCode: falls back to `.claude/skills/` covered by the Claude Code plugin
 *
 * Gemini's TOML surface is handled separately by `syncGeminiCommands`
 * (not symlink-based).
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
        sourcePrefix: '../../.agent/skills/',
        sourceRootDir: 'node_modules/@webpresso/agent-kit/skills',
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
 * Gemini transform: produces TOML from a rule's body. The `description`
 * field comes from frontmatter when present (parsed upstream by the loader).
 * `$ARGUMENTS` is rewritten to `{{args}}` as in `syncGeminiCommands`.
 */
function geminiTransform(input) {
    const { record } = input;
    const description = (() => {
        const fm = record.rawFrontmatter;
        const d = fm['description'];
        return typeof d === 'string' ? d : '';
    })();
    const prompt = record.body.replace(/\$ARGUMENTS/g, '{{args}}');
    // Inline the existing TOML formatter (toToml) without import to avoid a
    // cycle; keep output byte-identical.
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const escDesc = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escPrompt = prompt.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
    return `description = "${escDesc}"\nprompt = """\n${escPrompt}\n"""\n`;
}
/**
 * Default registry of unified consumers (rules + skills projection).
 *
 * Per the Wave 2 task plan:
 *   - `.agent/{rules,skills}/` (working dir): symlink, accepts rule + skill
 *   - `.cursor/rules/`: copy, accepts rule (Cursor follows symlinks unreliably)
 *   - `.windsurf/skills/`: copy, accepts skill
 *   - `.claude/skills/`: symlink, accepts rule (wrapped) + skill
 *   - `.gemini/commands/`: transform, accepts rule (workflows handled separately)
 *   - `.codex/agents/`: symlink, accepts rule + skill
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
    // Claude: rules wrapped (symlinked) + skills (symlinked) — both under .claude/skills/
    { id: 'claude-rules', dir: '.claude/skills', acceptsKind: 'rule', strategy: 'symlink' },
    { id: 'claude-skills', dir: '.claude/skills', acceptsKind: 'skill', strategy: 'symlink' },
    // Gemini: rules transformed to TOML
    {
        id: 'gemini-commands',
        dir: '.gemini/commands',
        acceptsKind: 'rule',
        strategy: 'transform',
        ruleExtension: '.toml',
        transform: geminiTransform,
    },
    // Codex: rules + skills, symlinked
    { id: 'codex-rules', dir: '.codex/agents', acceptsKind: 'rule', strategy: 'symlink' },
    { id: 'codex-skills', dir: '.codex/agents', acceptsKind: 'skill', strategy: 'symlink' },
];
//# sourceMappingURL=consumers.js.map