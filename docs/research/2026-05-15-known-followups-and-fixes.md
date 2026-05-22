---
type: research
title: 'Known follow-ups from /verify — best-practice fixes'
subject: 'tracked-but-gitignored generated files; in-flight source updates; auto-sync drift'
date: '2026-05-15'
last_updated: '2026-05-15'
confidence: high
verdict: adopt
---

# Known follow-ups from /verify — best-practice fixes

> Three follow-ups from the /verify pass on commits 6326c88 + 7faaf9d.
> Researched canonical fixes against credible sources (git docs, Atlassian,
> Claude Code official, OpenAI Codex official). Applied the fixes inline.

## TL;DR

- **A) `.codex/agents/` + `.codex/skills/` showing as modified despite gitignore intent** — canonical fix: `git rm --cached -r` to wholesale untrack files committed before the gitignore rules stabilized. **Apply.**
- **B) `.codex/hooks.json` modified with user-specific absolute paths** — Phase 6.5.7 violation. The 8a31e2a `CODEX_BIN` change made this file machine-specific. Either regenerate with portable paths OR add to gitignore. **Decision: gitignore + untrack** (consistent with AGENTS.md safety boundary; matches Claude Code best practice for personal/regenerated artifacts).
- **C) `src/codex/app-server/*` (3 files) and `src/cli/commands/init/*.test.ts` (3 files)** — real in-flight source work. **Commit normally.**
- The current `.gitignore` has contradictory `!.codex/agents/` followed by `.codex/agents/` rules (last-rule-wins, ignored is final state). **Simplify** to remove the dead allow-then-deny dance.

## What This Is

After the /verify pass on this session's commits, the worktree had 18 dirty files split across three patterns:

1. 12 tracked `.codex/agents/*.toml` and `.codex/skills/*/SKILL.md` files that match the gitignore's final state (ignored) but were tracked from before the rules tightened
2. 1 `.codex/hooks.json` whose modifications include user-specific absolute paths
3. 3 untracked `src/codex/app-server/*` source updates + 3 in-flight `src/cli/commands/init/*.test.ts` test updates from a parallel author / auto-sync

This document researches the canonical fix for each pattern against credible sources.

## State of the Art (2026)

### Files committed before being added to .gitignore

The canonical fix is well-established: `.gitignore` only affects untracked files; if a file is already tracked, adding it to `.gitignore` does not stop Git from tracking it ([Atlassian Git Tutorial](https://www.atlassian.com/git/tutorials/saving-changes/gitignore)). The fix is `git rm --cached -r <path>` to remove from the index while keeping on disk, then commit the removal alongside any gitignore edit ([git-scm.com docs](https://git-scm.com/docs/gitignore)).

For monorepos this is especially load-bearing — Git tracks every file in the index and uses it to determine changes; the file count directly impacts the performance of `git status` and `git commit` ([GitHub Engineering Blog: Improve Git monorepo performance with a file system monitor](https://github.blog/engineering/infrastructure/improve-git-monorepo-performance-with-a-file-system-monitor/)).

### `.claude/` and `.codex/` directory conventions

Claude Code's official guidance: `settings.json` is committed (team-shared), `settings.local.json` is gitignored (personal). The `.claude/` directory is a partial-commit pattern — commit slash commands, agents, hooks, skills; gitignore the personal/local files ([Claude Code best practices](https://code.claude.com/docs/en/best-practices), [Claude Code .claude folder complete guide](https://www.claudebuddy.art/blog/claude-code-folder-complete-guide), [Claude Code gitignore best practices](https://claudecodeguides.com/claude-code-gitignore-best-practices/)).

OpenAI Codex's official guidance: `AGENTS.md` is committed and shared; `AGENTS.override.md` is gitignored and personal. Skills are stored in `.agents/skills/` for shared team skills ([OpenAI Codex Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md), [OpenAI Codex Agent Skills](https://developers.openai.com/codex/skills)).

agent-kit's stricter posture (per AGENTS.md "Do not commit agent surfaces") goes one step further: ALL agent surfaces are gitignored because everything is regenerated from the canonical `catalog/agent/` source via `wp sync`. This is consistent with the upstream guidance for the personal-shadow files but extends it to the team-shared files too — defensible because regeneration is fast and deterministic.

### Pre-commit / mid-session source modification

A known pain pattern: tools like Black or Prettier modifying source files during pre-commit, causing the hook to fail and requiring re-staging ([psf/black#1857](https://github.com/psf/black/issues/1857), [pre-commit/pre-commit#806](https://github.com/pre-commit/pre-commit/issues/806)). Mitigations include auto-staging changed files OR pinning tool versions across the local-dev / pre-commit boundary ([sync-with-uv](https://pydevtools.com/blog/sync-with-uv-eliminate-pre-commit-version-drift/)).

For agent-kit's case (auto-sync from `catalog/` → `.codex/`, `.gemini/`, `.cursor/`, etc.), the pattern is intentional and matches `wp sync`'s contract. The drift onto `src/cli/commands/init/*.test.ts` files is NOT auto-sync — it's most likely real in-flight source updates from a parallel author (a separate commit `98c8a12` landed mid-session).

## Positive Signals

### Canonical fix exists and is well-documented

- `git rm --cached -r <path>` is THE answer per Atlassian, git-scm, GitHub Discussions, and every git tutorial ([Atlassian](https://www.atlassian.com/git/tutorials/saving-changes/gitignore), [git-scm](https://git-scm.com/docs/gitignore))
- Files stay on disk; only the index entries are removed
- One-shot cleanup matches the "fix the root, not the symptom" rule (no need to bypass git status output every time)

### Scaffolder regenerates `.codex/*` deterministically from catalog

- `wp sync` + `scaffoldAgentHooks` produce these files; they're not authored
- Untracking is safe: a fresh `wp setup` will recreate them with current shape
- Aligns with AGENTS.md safety boundary explicitly: "agent surfaces… are gitignored and regenerated by `wp setup` / `omx setup`"

### The `.gitignore` cleanup is also a quality win

- The current rule sequence (`.codex/*`, then `!.codex/agents/**`, then `.codex/agents/`) is contradictory and confusing — last rule wins, but readers waste cycles parsing intent
- Collapsing to the simpler form documents intent better

## Negative Signals

### Untracking 100+ files is a noisy commit

- Untracking the full set of 115 `.codex/*` legacy-tracked files produces a large index-only diff
- Reviewers see "100 files removed" on first glance and worry — explanatory commit message is essential
- Mitigation: explicit Lore Commit Protocol message naming the canonical fix and citing AGENTS.md safety boundary

### `.codex/hooks.json` regeneration is non-portable

- The 8a31e2a `CODEX_BIN` change made `scaffoldAgentHooks` produce absolute paths (`/Users/ozby/...`) per machine
- This file CAN'T be team-shared in current form
- Adding to gitignore is the simplest fix; alternative is reverting `CODEX_BIN` to relative form, which would un-fix the codex hook trust path-stability story (codex needs absolute paths for trust verification)
- Best path forward: keep `CODEX_BIN` absolute (correct for codex trust); gitignore the regenerated file; consumers regenerate fresh on `wp setup`

### Removing tracked files affects clones

- After `git rm --cached`, fresh clones do NOT get the file from git history (it's untracked going forward)
- For agent-kit specifically this is fine — `wp setup` regenerates them
- For consumers vendoring agent-kit, they'd run `wp setup` post-install; same outcome

## Community Sentiment

Strong consensus across all sources: when files are tracked but should be gitignored, `git rm --cached` is the answer. Not controversial. The Atlassian, git-scm, LabEx, GeeksforGeeks, Graphite, and dev.to articles all converge on this exact recipe.

For the partial-commit pattern in `.claude/` and `.codex/`: Anthropic's and OpenAI's official docs both endorse it (commit shared config, gitignore personal/local). agent-kit's stricter "all gitignored" posture is a defensible delta because regeneration is its product surface.

## Project Alignment

### Vision Fit

agent-kit's stated principle: catalog is the source of truth, per-IDE surfaces are projected by `wp sync`. Untracking `.codex/agents/` + `.codex/skills/` enforces that principle in git too. Currently the index claims those files are "real" tracked artifacts; after the fix, the index claims what AGENTS.md says: they're regenerated.

### Tech Stack Fit

Zero stack changes. Pure git index hygiene + a small `.gitignore` cleanup. No tool versions, no dependencies, no runtime impact.

### Trade-offs for Current Stage

agent-kit just shipped 6 commits this session. Wedging a 100-file index-cleanup commit into the same window risks reviewer churn. Counter: the cleanup is a one-shot fix that pays back forever (no more "modified" noise on every `wp sync` run). Doing it now while the topic is fresh beats letting it accumulate further.

## Recommendation

**Adopt** the canonical fix immediately:

1. **Untrack** all currently-tracked files under `.codex/agents/` and `.codex/skills/` via `git rm --cached -r`. Files stay on disk; only the index changes.
2. **Untrack and gitignore** `.codex/hooks.json` — its post-8a31e2a content is machine-specific (absolute paths with username) and matches the AGENTS.md safety boundary for "regenerated by `wp setup`".
3. **Simplify `.gitignore`** to drop the contradictory `!.codex/agents/` / `.codex/agents/` allow-then-deny dance. New rule shape:

   ```gitignore
   .codex/*
   !.codex/prompts/
   !.codex/prompts/**
   ```

   `.codex/hooks.json` is now consistently ignored alongside agents+skills; `.codex/prompts/` remains tracked (operator-curated content).
4. **Commit `src/codex/app-server/*`** updates as a focused commit — these are real schema enhancements (HookEventName camelCase normalize transform, ConfigBatchWriteResponse passthrough).
5. **Commit `src/cli/commands/init/*.test.ts`** drift as in-flight follow-up — these match the codex hook trust scaffolder series.

Confidence: **high** for items 1-4 (canonical patterns, well-cited). Medium for item 5 (in-flight changes from a parallel author; would prefer their authorship but folding in is consistent with the user's "sweep" preference earlier this session).

Conditions that would change the recommendation:
- If `.codex/prompts/` turns out to also be auto-regenerated → extend the gitignore simplification to ignore it too
- If a downstream consumer (ozby/ingest-lens) depends on the tracked `.codex/agents/` content → coordinate the cleanup with their `wp setup` flow

## Sources

- [1] [git-scm.com — gitignore documentation](https://git-scm.com/docs/gitignore) — official, high credibility, neutral
- [2] [Atlassian — .gitignore file - ignoring files in Git](https://www.atlassian.com/git/tutorials/saving-changes/gitignore) — vendor docs, high credibility, neutral
- [3] [GitHub Engineering Blog — Improve Git monorepo performance with a file system monitor](https://github.blog/engineering/infrastructure/improve-git-monorepo-performance-with-a-file-system-monitor/) — official engineering blog, high credibility, monorepo-positive
- [4] [Claude Code best practices](https://code.claude.com/docs/en/best-practices) — official Anthropic docs, high credibility, neutral
- [5] [Claude Code gitignore best practices](https://claudecodeguides.com/claude-code-gitignore-best-practices/) — third-party guide, medium credibility, mildly positive
- [6] [Claude Code .claude folder complete guide (2026)](https://www.claudebuddy.art/blog/claude-code-folder-complete-guide) — third-party guide, medium credibility, neutral
- [7] [OpenAI Codex — Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md) — official OpenAI docs, high credibility, neutral
- [8] [OpenAI Codex — Agent Skills](https://developers.openai.com/codex/skills) — official OpenAI docs, high credibility, neutral
- [9] [psf/black#1857 — pre-commit hook auto-format problem](https://github.com/psf/black/issues/1857) — community issue thread, medium credibility, mildly negative on auto-format-during-commit
- [10] [pre-commit/pre-commit#806 — Automatically stage files changed by hook](https://github.com/pre-commit/pre-commit/issues/806) — upstream maintainer thread, high credibility, neutral
- [11] [sync-with-uv — Eliminate pre-commit version drift](https://pydevtools.com/blog/sync-with-uv-eliminate-pre-commit-version-drift/) — third-party blog, medium credibility, positive on version-pinning
- [12] [Graphite — How to stop tracking a file in Git](https://graphite.com/guides/stop-tracking-file-git) — vendor docs, medium credibility, neutral
