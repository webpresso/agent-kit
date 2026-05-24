---
type: research
title: "Agent-Kit README Rewrite — Pain-First Positioning, No AI Slop, Concrete Examples"
subject: "How to rewrite README.md so it explains the pain, the move, and what changes — with no AI-generated nonsense"
date: 2026-05-09
last_updated: '2026-05-09'
confidence: high
verdict: adopt
---

# Agent-Kit README Rewrite — Pain-First Positioning, No AI Slop, Concrete Examples

> The current README is a feature inventory wearing a Path A / Path B install banner. The fix is concrete: open with the pain (already written in VISION.md), follow with five before/after pairs that name a repo file and a command, and cut every "ties together" / "additive and idempotent" / "what you get:" sentence on sight.

## TL;DR

- **Current README's first sentence is a comma-soup of five proper nouns** — Blueprint runtime, Symlinker, Skills catalog, Lore commit protocol, Tech-Debt lifecycle. A reader has no idea why they'd care until line 200+.
- **agent-kit's pain is already written**, in [`VISION.md` "The problem"](../../VISION.md): "Every repo using AI coding agents needs the same scaffolding… each team hand-crafts this from scratch, surfaces drift across tools and repos, and the knowledge of what to configure and why lives in tribal memory rather than code." That paragraph belongs at the top of the README.
- **Competitive landscape is split into two categories.** Skills *libraries* (claude-skills, antigravity-awesome-skills, cc-sdd) lead with skill counts. agent-kit is not in that category — it's a *scaffolder + lifecycle + audit infrastructure*. Position against [context-mode](https://github.com/mksglu/context-mode), not skill registries. Context-mode's tagline ("Context window optimization for AI coding agents. Sandboxes tool output, 98% reduction. 14 platforms") is the gold standard: WHAT + FOR WHO + HOW + RESULT + REACH in 14 words.
- **AI-slop tells already in the README**: "ties all of it together — one install, all IDEs covered", "additive and idempotent", "summary-first", "convergent path", "What you get:" + noun pile, "zero-config" buzzword. Strip these.
- **Concrete fix:** new structure (Title → 1-line desc → Pain → Quick start → 5 before/after pairs → Install matrix → CLI table → Skills → Non-goals → Status → License). README target length: ~150 lines. Current is 247.

## What This Is

A pre-rewrite research pass for `README.md` at `/Users/ozby/repos/webpresso/agent-kit/README.md`. Inputs: README best-practice consensus (2026), AI-slop detection literature, four competitor READMEs in the agent-tooling space, and agent-kit's own `VISION.md` and CLI surface. Output: a recommended structure, draft opener variants, and a copy/pasteable five-pair before/after table.

## State of the Art (2026)

**README structure consensus** ([Make a README](https://www.makeareadme.com/), [How to Write a Good README — 2026 Guide](https://www.kunalganglani.com/blog/write-good-readme-guide), [jehna/readme-best-practices](https://github.com/jehna/readme-best-practices)):

1. Title + **one-line description that names what it does and for whom** ("A lightweight CLI tool for converting Markdown to PDF" beats "Welcome to ProjectX!" every time).
2. **The Why** — the 2-3 sentence pain hook **before installation**. Most READMEs skip straight to install; that's the most common mistake of the five.
3. Quick-start (5 lines max) — for impatient readers.
4. Usage examples showing the 2-3 most common operations, by code block.
5. Install / configuration detail — for the slow-readers.
6. Comparison table when the project lives in a competitive space.
7. **Non-goals** — explicit "what this doesn't do" saves users time.
8. Status (active/experimental/archived).
9. License.

**The "5 mistakes that kill open-source projects"** (kunalganglani, 2026):
1. The empty README.
2. The "obvious to me" README — install instructions that assume ecosystem knowledge.
3. **The novel** — 10k words, no structure. Engineers scan, they don't read.
4. The outdated README — references a deprecated CLI flag, screenshots from a redesign two versions back. Worse than missing.
5. The marketing brochure — adjectives without examples.

**AI slop in documentation** ([anti-slop-writing](https://github.com/adenaufal/anti-slop-writing), [AI Slopageddon](https://www.kunalganglani.com/blog/ai-slopageddon-open-source-crisis/), [LLMs Have Revived These 5 Anti-Patterns](https://medium.com/according-to-context/llms-have-revived-these-5-anti-patterns-in-software-engineering-e685159fc4d8)):

- **Vocabulary banlist** (high signal): *delve, tapestry, robust, crucial(ly), cutting-edge, game-changer, thought leadership, leverage, unlock, seamless(ly), comprehensive, powerful, navigate the complexities of, at its core, plays a significant role, in today's fast-paced, ties together, additive and idempotent.*
- **Hedging tells**: *can, may, might, could potentially.* Human experts state things.
- **Structural tells**: bloated paragraphs, predictable three-item cadence, "What you get:" followed by a noun pile, comments describing what the AI thinks the code does (not what it does), grammatically perfect JSDoc that subtly mismatches the function body.

## Positive Signals

### Competitor positioning to learn from

**[context-mode](https://github.com/mksglu/context-mode) — best-in-class for this category.**
About line: *"Context window optimization for AI coding agents. Sandboxes tool output, 98% reduction. 14 platforms."*
That's WHAT + FOR WHO + HOW + RESULT + REACH in one sentence. No adjectives. Numbers do the lifting. agent-kit has comparable concrete numbers it can use (one command, six IDE surfaces synced, ~18 skills, eight composite audits) but never presents them like this.

**[cc-sdd](https://github.com/gotalab/cc-sdd) — clean structural template.**
Title: *"Long-running spec-driven implementation for AI coding agents"*. Quick-start lives at line ~30 (`npx cc-sdd@latest`). Supports 8 AI coding agents and 13 languages — both numbers stated up front, not buried.

**[claude-skills](https://github.com/alirezarezvani/claude-skills) and [antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills)** are skills *libraries* (232+ and 1,400+ skills respectively) — different category from agent-kit. **Do not position agent-kit as a skill catalog;** it has 18 curated skills, not thousands. It will lose that comparison and it isn't the value prop anyway.

### What agent-kit's README already gets right

- Codeblocks for every install path are concrete and copy-pasteable.
- The IDE Support Matrix (line 121) is the kind of scannable artifact engineers want.
- The CLI Reference table (line 131) is genuinely useful.
- VISION.md exists and the pain hook is already written — it just hasn't been promoted to the README.

## Negative Signals

### Specific defects in current README (line numbers from the live file)

- **Line 3 — feature soup.** "Ships a Blueprint runtime…, a Symlinker…, a curated Skills catalog…, a Lore commit protocol…, a Tech-Debt lifecycle…, and the wp CLI that ties all of it together — one install, all IDEs covered." Five proper nouns + "ties together" + "one install". Reader has no anchor.
- **Lines 5–119 — install before why.** 114 lines of install matrix, runtime contract, "two coexisting distribution channels", convergence prose. None of it answers "why would I need this."
- **Line 19 — comma-soup.** "What you get: hooks (PreToolUse, PostToolUse, Stop, SessionStart), `wp mcp` server with 7 tools (`wp_test`, `wp_e2e`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_audit`, `wp_blueprint`), slash commands (`/wp:test`, `/wp:qa`, `/wp:audit`, `/wp:blueprint`), and the skill catalog." Classic AI-slop noun pile.
- **Line 21 — "summary-first" is jargon** with no referent for a reader meeting the project for the first time.
- **Line 38 — "Why two paths"** misframes the question. The reader's question is "what does this do for me," not "why are there two paths."
- **Line 122 — IDE matrix is correct content but in the wrong place.** Should be deeper, not at line 122 of the structural arc.
- **Line 132 — CLI reference exists but is unanchored.** Without a "what does this do" up top, the table is just a wall of `wp audit ...` rows with no narrative.
- **Line 140 — outdated CLI surface.** `wp symlink sync` is in the README; the actual CLI exposes `wp sync` (`wp symlink` returned `Unknown command` during CLI help verification). Direct example of [kunalganglani's "outdated README"](https://www.kunalganglani.com/blog/write-good-readme-guide) failure mode #4.
- **Line 198 — "Design Invariants" buried.** Two important invariants ("zero `@webpresso/*` runtime deps" and "catalog content is canonical once shipped") matter, but live below the fold.
- **Line 201 — "Status: Experimental (v0.x)" buried.** Should be in the first 30 lines so readers calibrate trust.

### AI-slop phrases to strip (verbatim from current README)

- "ties all of it together — one install, all IDEs covered" (line 3)
- "What you get: …" (line 19, line 34) — followed by noun pile
- "additive and idempotent" (line 10)
- "convergent path" / "Convergence with Claude Code's plugin path" (line 71, line 90)
- "summary-first" (line 21, line 243) — jargon
- "zero-config" (line 12) — marketing word
- "every hook fires from live source" (line 25) — overstatement, masks "and it works idempotently across re-runs"

## Community Sentiment

Across the README-best-practices corpus reviewed, three claims show up in 4+ independent sources:

1. **The Why goes before the How.** ([kunalganglani](https://www.kunalganglani.com/blog/write-good-readme-guide), [Make a README](https://www.makeareadme.com/), [Tom Preston-Werner — Readme Driven Development](https://tom.preston-werner.com/2010/08/23/readme-driven-development.html), [thejunkland](https://thejunkland.com/blog/how-to-write-good-readme.html)). The README is *not* documentation — it's a pitch for whether to invest the next 20 minutes.
2. **Scannable beats comprehensive.** Engineers scan, they don't read. Headers, bullet lists, code blocks. Walls of prose lose readers in under three seconds.
3. **Concrete > abstract.** Numbers (14 platforms, 98% reduction, 8 agents) and *named files* (`.agent/skills/foo/SKILL.md`, `blueprints/in-progress/`) beat adjectives. This is also the strongest anti-AI-slop defense — slop is allergic to specifics.

## Project Alignment

### Vision Fit

agent-kit's `VISION.md` is unusually well-written and already contains the pain hook, the north star, and the boundaries. The README's job is to *expose* that, not invent new prose. Three blocks from VISION.md should land verbatim in the README:

- "The problem" (3 sentences) → top of README, replacing line 3.
- "North star: One command, fully wired" → 2nd block.
- "Out of scope" → README "Non-goals" section near the bottom.

### Tech Stack Fit

agent-kit ships as a Claude Code plugin AND an npm package, has 19 CLI verbs, 18 skills, and 8+ audit kinds. The README must cover all distribution paths but should not lead with them. The IDE matrix and CLI reference are reference material — they belong, but after the "why."

The package.json `description` field is also a touchpoint — currently *"Toolkit for agent-driven development: Blueprint runtime, agent-surface symlinker, skills catalog, and the `wp` CLI that ties them together."* This has the same "ties together" tell. Consider rewriting it in lockstep with the README opener.

### Trade-offs for Current Stage

- **Status: Experimental (v0.x).** Promote this near the top so readers don't expect API stability the project doesn't promise.
- **Two distribution paths exist for a reason** (Codex CLI has no plugin marketplace yet). The README should explain this in 2 sentences, not 60 lines. Detail goes to `docs/getting-started.md`.
- **The skills catalog is small but curated (18).** Don't compete on size. Frame as "opinionated baseline you can extend" not "1,400+ skills."

## Recommendation

**Adopt** the structure below. Confidence: high. Reasoning: the pain is already written, the audience is known, and the AI-slop signals are concrete enough to grep for.

### Recommended README structure (target ~150 lines)

```
1. Title + one-line description
2. Pain hook (3 sentences — verbatim from VISION.md "The problem")
3. Quick start (3 lines — `npx wp setup` for npm, `/plugin marketplace add` for Claude Code)
4. What changes after `wp setup` — 5 concrete before/after pairs
5. Install matrix (Path A: Claude Code plugin, Path B: npm + wp setup)
6. CLI reference table (existing — keep)
7. Skills catalog (one paragraph, link to catalog/)
8. Non-goals (verbatim from VISION.md "Out of scope")
9. Status — Experimental (v0.x)
10. License
```

### Opener draft (option A — pain-led, recommended)

```markdown
# @webpresso/agent-kit

> The `wp` CLI: one command scaffolds a repo so every AI coding agent —
> Claude Code, Codex CLI, Cursor, Windsurf, Gemini, OpenCode — has the
> same context, hooks, and guardrails. No tribal knowledge. No per-repo
> drift.

Every repo using AI coding agents needs the same scaffolding: an `AGENTS.md`
operating contract, scoped rules, lifecycle hooks, slash-command skills,
quality gates. Today each team hand-crafts this from scratch — and
the knowledge of *what* to configure and *why* lives in tribal memory,
not in code. agent-kit is the catalog and the CLI that fixes that.
```

### Opener draft (option B — context-mode-style numeric, alternative)

```markdown
# @webpresso/agent-kit

> One command wires every AI coding agent in your repo. Six IDE surfaces,
> 18 curated skills, eight composite audits, blueprint + lore + tech-debt
> lifecycles. MIT.

`wp setup` turns a bare git checkout into a repo where Claude Code, Codex,
Cursor, Windsurf, Gemini, and OpenCode all share the same operating
contract, the same skills, the same hooks, the same audits. Edit the
canonical `.agent/` once; `wp sync` propagates everywhere.
```

### The five before/after pairs (to anchor "what changes")

````markdown
## What changes after `wp setup`

### 1. Multi-IDE rule sync (no more drift)

| Before | After |
| --- | --- |
| Edit `.cursor/rules/foo.md`. Then `.claude/skills/foo/SKILL.md`. Then `.gemini/commands/foo.toml`. Then `.windsurf/rules/foo.md`. Four files for one rule. They drift. | Edit `.agent/skills/foo/SKILL.md`. Run `wp sync`. Done. `wp audit catalog-drift` fails CI if anything diverges. |

### 2. Repo bootstrap (one command, idempotent)

```bash
# Before:
#   copy AGENTS.md, wire .codex/hooks.json, patch .claude/settings.json,
#   install Husky, configure commitlint, set up secretlint, bolt on
#   bundle-budget, blueprint-lifecycle, catalog-drift checks. Hours, drifts.

# After:
npx wp setup
```

### 3. Implementation plans that don't rot

| Before | After |
| --- | --- |
| Paste a plan into chat. Lose it on `/clear`. Plan rots. No way to track which agent has worked on which task. | `wp blueprint new "<goal>"` writes a markdown plan to `blueprints/in-progress/`. Lifecycle states (`draft` / `planned` / `in-progress` / `completed`) are CI-gated by `wp audit blueprint-lifecycle`. |

### 4. Commit messages as decision records

| Before | After |
| --- | --- |
| `git log` returns "fix bug in auth" — useless six months later. | The Lore Commit Protocol writes structured decision trailers (`Lore-Why:`, `Lore-Alternative:`, `Lore-Decision:`). Queryable via `git log`. Audit-gated by `wp audit commit-message --require-lore`. |

### 5. Tech-debt that gets reviewed, not ignored

| Before | After |
| --- | --- |
| 47 TODO comments, no owner, no triage, no review cadence. | `wp tech-debt new --severity high --category complexity` creates `tech-debt/<status>/h-NNN-slug.md` with a documented status (`accepted` / `needs-remediation` / `monitoring` / `resolved`) and a review cadence. `wp audit tech-debt` keeps the inventory honest. |

### 6. One audit gate that runs every check

```bash
# Before: 8 separate pre-commit hooks, each in its own config file.
# After:  one composite, same registry powers pre-commit + CI + ship gate.
wp audit guardrails
# runs: catalog-drift + blueprint-lifecycle + roadmap-links +
#       docs-frontmatter + vision + tech-debt +
#       no-relative-parent-imports + bucket-boundary
```
````

### Lines to delete from current README

- Line 21 — "Long-running MCP tools are now **summary-first**…" (jargon, belongs in CHANGELOG)
- Line 23 — "Plugin runtime contract" paragraph (move to CONTRIBUTING.md)
- Line 25 — "Plugin dev mode" paragraph (move to CONTRIBUTING.md — already linked there)
- Lines 38–40 — "Why two paths" paragraph (compress to one sentence in the install matrix)
- Lines 73–88 — entire "OMX compatibility" / Codex MCP server TOML block (move to `docs/codex-setup.md` or `docs/presets.md` — already exists)
- Lines 93–112 — entire `context-mode` preset block (move to `docs/presets.md`)
- Lines 219–235 — Vite Guardrails + Portable Test surfaces (move to `docs/api-surfaces.md` — these are not first-impression content)

### Lines to fix

- Line 140 — "wp symlink sync" → "wp sync" (factual error: command was renamed).
- Line 144 — "wp setup" description still says "default external tooling presets (`omx`, `gstack`)"; verify against current setup defaults.

### Conditions under which the recommendation would change

- If agent-kit pivots to be a *skills library* with hundreds of skills, the positioning would flip toward the antigravity / claude-skills shape (lead with skill count). That's not the current direction.
- If the npm-package distribution path is deprecated (Codex CLI ships a marketplace), the install matrix collapses to one path and the README simplifies further.

## Sources

- [1] [Context-mode (mksglu)](https://github.com/mksglu/context-mode) — official repo, high credibility, positive (gold-standard tagline reference).
- [2] [How to Write a Good README — 2026 Guide](https://www.kunalganglani.com/blog/write-good-readme-guide) — engineering blog, high credibility, contains the "5 mistakes" framework and "What goes in the README" section.
- [3] [AI Slopageddon — How AI-Generated Code Is Destroying Open Source](https://www.kunalganglani.com/blog/ai-slopageddon-open-source-crisis/) — engineering blog, high credibility, characterises AI-slop in PRs and READMEs.
- [4] [adenaufal/anti-slop-writing](https://github.com/adenaufal/anti-slop-writing) — open-source skill, medium-high credibility, ships a vocabulary-banlist + structural-patterns reference.
- [5] [Make a README](https://www.makeareadme.com/) — community standard, high credibility, minimum-floor template.
- [6] [jehna/readme-best-practices](https://github.com/jehna/readme-best-practices) — open-source, medium credibility, structure reference.
- [7] [thejunkland — How to write good README](https://thejunkland.com/blog/how-to-write-good-readme.html) — engineering blog, medium credibility, agreement on scannability principle.
- [8] [Tom Preston-Werner — Readme Driven Development](https://tom.preston-werner.com/2010/08/23/readme-driven-development.html) — GitHub co-founder, high credibility, "write the README first" canonical argument.
- [9] [gotalab/cc-sdd](https://github.com/gotalab/cc-sdd) — competitor in adjacent category, structural template (clean quick-start, numbers up front).
- [10] [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — competitor in skills-library category, positioning contrast.
- [11] [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) — competitor in skills-library category, positioning contrast.
- [12] [LLMs Have Revived These 5 Anti-Patterns](https://medium.com/according-to-context/llms-have-revived-these-5-anti-patterns-in-software-engineering-e685159fc4d8) — engineering blog, medium credibility, AI-slop characterisation.
- [13] [agent-kit VISION.md](../../VISION.md) — own vision doc, internal source, the pain hook lives here.
- [14] [Existing research — Context-mode Plugin Architecture for Agent-Kit Adoption](./2026-04-26-context-mode-plugin-architecture.md) — internal research, prior session, gives the architectural framing for "why context-mode is our positioning peer."

## Verdict

**adopt** — high confidence. The rewrite is mechanical: lift the pain from VISION.md, drop in five before/after pairs that name files and commands, strip the AI-slop phrases listed above, and move install detail below the fold. Target is ~150 lines from the current 247. No new prose needs to be invented — the load-bearing text already exists in the repo.
