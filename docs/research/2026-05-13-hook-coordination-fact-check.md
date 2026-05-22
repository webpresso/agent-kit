---
type: research
title: "Hook Coordination Across RTK, context-mode, and agent-kit — Fact-Check and SoA (May 2026)"
subject: "make rtk + context-mode + agent-kit hooks play along better"
date: 2026-05-13
last_updated: 2026-05-13
confidence: high
verdict: trial
---

# Hook Coordination Across RTK, context-mode, and agent-kit — Fact-Check and SoA

> **TL;DR.** Three of the four moves I proposed in the prior turn do not survive contact with the verified Anthropic hooks spec and the existing webpresso blueprint at [`monorepo/webpresso/blueprints/planned/cross-runtime-hook-surface-alignment`](../../../monorepo/webpresso/blueprints/planned/cross-runtime-hook-surface-alignment/). The blueprint already names the correct shape — *ownership boundaries audited by owner+command identity, with cross-owner composition explicitly allowed* — and the right move is to land that blueprint rather than invent a parallel coordination scheme.

## What was verified from Anthropic docs

Direct quotes from [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) and [/hooks-guide](https://code.claude.com/docs/en/hooks-guide), fetched May 13 2026:

| Fact | Quote | Source |
| ---- | ----- | ------ |
| Hooks run in parallel within an event | *"All matching hooks run in parallel"* | [hooks#prompt-and-agent-hook-fields](https://code.claude.com/docs/en/hooks) |
| `updatedInput` collisions are non-deterministic | *"When multiple PreToolUse hooks return `updatedInput` to rewrite a tool's arguments, the last one to finish wins. Since hooks run in parallel, the order is non-deterministic. Avoid having more than one hook modify the same tool's input."* | [hooks-guide](https://code.claude.com/docs/en/hooks-guide) |
| There is **no** priority/ordering field | (none documented; not in the [hook config schema](https://code.claude.com/docs/en/hooks)) | hooks reference |
| `permissionDecision: "deny"` is supreme | *"A hook that returns `permissionDecision: 'deny'` blocks the tool even in `bypassPermissions` mode or with `--dangerously-skip-permissions`."* | hooks-guide |
| `"allow"` does **not** override deny rules | *"Deny rules from any settings scope, including managed settings, always take precedence over hook approvals."* | hooks-guide |
| Identical handlers are deduplicated | *"Identical handlers are deduplicated automatically. Command hooks are deduplicated by command string and `args`."* | hooks reference |
| `additionalContext` is capped at 10K chars | *"Output that exceeds this limit is saved to a file and replaced with a preview and file path"* | hooks reference |
| SessionStart re-fires on compact | matcher `startup\|resume\|compact`; agent-kit's `sessionstart/index.ts` explicitly comments *"the `compact` source is included so the routing block is re-injected after context compaction (F3 from fact-check: block is silently dropped without it)"* | [agent-kit sessionstart](../../src/hooks/sessionstart/index.ts) |

## What the existing blueprint already mandates

[`monorepo/webpresso/blueprints/planned/cross-runtime-hook-surface-alignment/_overview.md`](../../../monorepo/webpresso/blueprints/planned/cross-runtime-hook-surface-alignment/_overview.md) (status: `planned`) names the goal as:

> *"Align the repo's Claude Code, Codex, and OpenCode hook/runtime surfaces with the current official guidance for `context-mode`, `oh-my-codex` (OMX), and `rtk`, while preventing unintended duplicate Codex hook ownership and documenting the intended ownership boundaries."*

And the architecture overview already encodes the ownership lanes:

```text
Claude Code
  ├─ official path: plugin + settings.json hooks
  ├─ agent-kit owns repo-local wp_* hook entrypoints
  ├─ context-mode owns ctx_* routing guidance when installed
  └─ rtk owns shell filtering lane where documented

Codex
  ├─ repo layer: .codex/hooks.json for agent-kit/OMX-managed local hooks
  ├─ global layer: ~/.codex/hooks.json for context-mode/Codex-native hooks
  ├─ expected composition: multiple owners may share an event
  └─ drift condition: same owner/command duplicated without an explicit exception

OpenCode
  └─ context-mode owns plugin-based routing/compaction support
```

The blueprint's **key design decision** — and the one that invalidates half of my prior advice — is Task 2.2:

> *"Same-event/different-owner Codex composition is accepted. Same owner/command duplication is reported as drift. The policy is encoded in tests, not only prose."*

In plain words: **multiple hooks on the same event is the policy, not a bug.** What's forbidden is **the same owner registering the same command twice**.

## Fact-check of my four prior claims

### Claim 1: "Pin a sequential hook order"

**Verdict: WRONG.**

The Anthropic spec explicitly says hooks run in parallel and there is no priority field. The guidance is structural: *"Avoid having more than one hook modify the same tool's input."* You cannot configure your way out of the race — you have to ensure only one rewriter exists per matcher.

In the actual installed state on this workspace:

- `~/.claude/settings.json` PreToolUse `Bash` matcher: `rtk hook claude` (user settings).
- `~/.claude/plugins/cache/context-mode/.../hooks/pretooluse.mjs` (plugin layer): rewrites Bash → `ctx_execute`.
- `/Users/ozby/repos/webpresso/agent-kit/.claude/settings.json` PreToolUse `Bash|Write|Edit|MultiEdit`: `wp-pretool-guard` (project settings).

`wp-pretool-guard` is a **validator** (verified: `src/hooks/pretool-guard/validators/*` — `forbidden-commands.test.ts`, `dangerous-commands.ts`, `mcp-redirect.ts`, `package-imports.ts`, `plan-frontmatter.ts`, `test-quality.ts`). It does not call `updatedInput`. So the actual race is **only** between RTK and context-mode.

The structural fix is *"only one rewriter per matcher"*: have context-mode itself detect RTK and either (a) skip its own rewrite when RTK is installed, or (b) compose them — see Claim 2.

### Claim 2: "Chain RTK inside `ctx_execute`"

**Verdict: VALID but requires confirmation against the blueprint's non-goals.**

Verified mechanism: RTK's `rtk hook claude` is registered on the `Bash` matcher. When context-mode wins the race and rewrites `tool_input` to `ctx_execute(language:"shell", code:"...")`, the tool name changes from `Bash` to `mcp__plugin_context-mode_context-mode__ctx_execute` — RTK's matcher no longer applies. RTK is bypassed.

The fix is in context-mode's [`hooks/pretooluse.mjs`](/Users/ozby/repos/ozby/context-mode/hooks/pretooluse.mjs) (you have a fork). When rewriting `Bash`→`ctx_execute`, wrap the inner code with `rtk` if `rtk` is on `$PATH`:

```js
const wrap = process.env.PATH?.includes("/opt/homebrew/bin") && existsSync("/opt/homebrew/bin/rtk")
  ? (cmd) => `rtk ${cmd}`
  : (cmd) => cmd;
updatedInput.code = wrap(originalCommand);
```

**Blueprint compatibility check.** The blueprint's non-goal says *"Expanding RTK beyond the ownership documented in repo/agent-kit guidance."* This change does **not** expand RTK's scope — it preserves RTK's shell-filtering ownership when context-mode's rewrite would otherwise hide the command from it. The ownership lanes are unchanged; only the invocation channel changes. This is composition, not lane expansion.

The bigger risk: RTK's filtering inside the sandbox might double-process output that context-mode already indexes. Worth a measurement before committing.

### Claim 3: "Merge the three SessionStart blocks"

**Verdict: WRONG by blueprint policy.**

The blueprint's edge-case table explicitly allows multi-owner SessionStart:

> *"`~/.codex/hooks.json` and `.codex/hooks.json` both include `SessionStart` — Allowed when commands belong to different owners; flagged only for same owner/command duplication."*

And the architecture overview names this *"expected composition: multiple owners may share an event."*

Trying to consolidate the blocks into a single `wp-sessionstart-routing` emission would: (1) couple context-mode's content to agent-kit's release cadence, (2) violate the explicit non-goal *"Hand-maintaining generated hook/config surfaces as the final solution,"* and (3) require agent-kit to know context-mode's internal injection format.

The right framing is **content density per block**, not block count. Each owner should emit a tight, non-redundant block. The current waste isn't *"three blocks fire"* — it's *"each block restates rules the others already cover."* That's a content question for each owner, not a coordination problem.

### Claim 4: "Extract one shared 'noisy commands' classifier"

**Verdict: MISALIGNED with the blueprint.**

The blueprint's ownership model is layered, not shared. RTK owns shell filtering. Context-mode owns `ctx_*` routing. Agent-kit owns `wp_*` routing. A shared classifier would couple all three to one config, which:

- Forces RTK's rules to ship through agent-kit (or vice versa), breaking independent release cadence.
- Makes RTK's command-set (38 verbs, [`rtk help`](/opt/homebrew/bin/rtk) output: `ls`, `tree`, `git`, `gh`, `aws`, `psql`, `pnpm`, etc.) discoverable inside agent-kit, which then has to track it. That's the wrong direction of coupling.
- Conflicts with the non-goal *"Expanding RTK beyond the ownership documented in repo/agent-kit guidance."*

The blueprint's preferred mechanism is audit-based: **`wp audit hook-surface`** (Task 1.2) verifies that active hook surfaces *don't overlap unexpectedly* and runs as a CI gate. The audit needs to know the lanes; it does not need a shared classifier.

## State of the art — May 2026 — for this exact stack

Distilled from the verified facts, the blueprint, and best-practice search:

1. **Lanes, not chains.** Each runtime extension owns a lane. Composition on shared events is expected; collisions on owner+command identity are drift. ([gstack-routing.md](../../catalog/agent/rules/gstack-routing.md) + cross-runtime-hook-surface-alignment).
2. **One rewriter per matcher.** Anthropic's spec makes parallel `updatedInput` non-deterministic. Treat it as a structural invariant: `Bash` has one rewriter (either RTK *or* context-mode, never both simultaneously rewriting).
3. **Audit, don't coordinate.** Verify ownership boundaries in CI via `wp audit hook-surface` using owner+command identity (Task 2.2). Don't try to coordinate at runtime — the runtime gives you no levers.
4. **Compose at the channel boundary, not the config layer.** When `ctx_execute(shell, code)` masks a command from RTK, fix it inside `ctx_execute`'s code field, not by reordering hooks.
5. **Re-inject on `compact`.** SessionStart blocks vanish after auto-compaction unless the hook matcher includes `compact`. agent-kit already does this; context-mode's `hooks.json` should be checked for the same. (Confirmed by agent-kit's [`sessionstart/index.ts`](../../src/hooks/sessionstart/index.ts) F3 fact-check comment.)
6. **Output cap is 10K chars.** SessionStart `additionalContext` exceeding 10K gets file-spilled. Keep each owner's block under 3K to leave headroom for two more owners without spillover. (Verified from hooks reference.)
7. **`deny` is the strongest contract.** When a guard needs to be unbypassable, return `permissionDecision: "deny"` — it outranks `bypassPermissions` and `--dangerously-skip-permissions`. Don't gate via `permissionDecisionReason` text alone.
8. **Plugin layer doesn't override user layer.** Hooks from all settings layers merge; identical handlers dedupe by command string. This is why a context-mode plugin hook + a user-settings `rtk hook claude` both fire — that's the intended composition, not a bug.

## Concrete recommendations (replaces my prior four)

Ordered by ROI, each aligned to the existing blueprint:

### 1. Land the blueprint phases as written

The blueprint already costs `M` total complexity (S + M + S phases). Phases 1 and 3 are `S`. Phase 2 fixes the actual upstream generators in `@webpresso/agent-kit`. Doing this **is** the answer to *"how do we make them play along better."* My prior suggestions are partial inventions of work the blueprint already specifies.

### 2. Add the `Bash`-matcher single-rewriter invariant to `wp audit hook-surface`

The blueprint's Task 1.2 (consumer-side hook-surface audit) and Task 2.2 (owner/command duplicate detection) should explicitly assert: **at most one hook with `updatedInput`-capable rewriting per matcher**. This catches the RTK+context-mode `Bash` collision today and prevents future regressions. (Mechanism: parse plugin hook manifests + settings.json; flag if more than one entry in the same matcher returns a non-noop `updatedInput`.)

### 3. Fix RTK invisibility inside `ctx_execute` (one-line patch in your fork)

In `/Users/ozby/repos/ozby/context-mode/hooks/pretooluse.mjs`, when emitting `updatedInput.code` for the shell language, prefix with `rtk ` if `rtk` is on PATH and the command isn't already an `rtk *` invocation. This recovers RTK's per-command filtering inside the context-mode sandbox without expanding RTK's ownership lane.

**Verify cost before committing:** measure raw vs. RTK-wrapped output size on a real `ctx_execute(shell, "git log -100")` — RTK filters first, context-mode indexes the filtered output. If RTK's compression > context-mode's indexing overhead, ship it. If not, skip.

### 4. Skip the SessionStart consolidation

Don't merge blocks. Instead, audit each owner's SessionStart payload for *content-level* redundancy (does ctx-mode's block restate any agent-kit rule? does agent-kit's block re-export any RTK verb?). The fix is dedup-at-the-source, not consolidation-at-the-emitter. This is a 30-min `grep` exercise per owner, not a coordination project.

### 5. Confirm `compact` matcher coverage in context-mode's Codex generator

Task 2.1 of the blueprint already calls this out: *"Align Codex context-mode event coverage upstream"* — context-mode's Codex hook scaffolder may be missing `PreCompact`/`PostCompact` coverage that exists in its Claude Code plugin. Confirm in the upstream context-mode repo at `~/.claude/plugins/cache/context-mode/.../hooks/codex/*.mjs` and file the gap upstream.

## Conditions under which this changes

- **Anthropic ships a `priority` field for hooks** → revisit Claim 1; pinning order becomes a one-line fix instead of a structural invariant.
- **context-mode upstream rewrites with `permissionDecision: "deny" + new tool call`** instead of `updatedInput` → race goes away; lanes can both safely rewrite.
- **Webpresso ships its own MCP server** (e.g. for blueprint queries) that needs to be funneled through context-mode's sandbox → the Bash single-rewriter invariant generalizes to "single rewriter per MCP-tool-matcher" and the audit needs the same rule applied broadly.

## Sources

1. [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — Anthropic hooks reference, fetched 2026-05-13. Type: official docs. Credibility: authoritative. Sentiment: neutral.
2. [code.claude.com/docs/en/hooks-guide](https://code.claude.com/docs/en/hooks-guide) — Automate workflows with hooks, fetched 2026-05-13. Type: official docs. Credibility: authoritative. Sentiment: neutral.
3. [monorepo/webpresso/blueprints/planned/cross-runtime-hook-surface-alignment](../../../monorepo/webpresso/blueprints/planned/cross-runtime-hook-surface-alignment/) — webpresso-owned planned blueprint. Type: in-repo planning. Credibility: authoritative for webpresso. Sentiment: neutral.
4. [catalog/agent/rules/gstack-routing.md](../../catalog/agent/rules/gstack-routing.md) — Lane 1–4 ownership rule. Type: in-repo rule. Credibility: authoritative. Sentiment: neutral.
5. [agent-kit/src/hooks/sessionstart/index.ts](../../src/hooks/sessionstart/index.ts) — agent-kit's SessionStart hook implementation; F3 fact-check comment on `compact` matcher requirement. Type: in-repo source. Credibility: authoritative. Sentiment: neutral.
6. [agent-kit/src/hooks/pretool-guard/validators/](../../src/hooks/pretool-guard/validators/) — verified: pretool-guard is a multi-validator, not a rewriter. Type: in-repo source. Credibility: authoritative. Sentiment: neutral.
7. [ozby/context-mode/hooks/pretooluse.mjs](/Users/ozby/repos/ozby/context-mode/hooks/pretooluse.mjs) — context-mode's PreToolUse hook source (215 lines); confirms self-heal + rewrite mechanism. Type: forked source. Credibility: high. Sentiment: neutral.
8. [/opt/homebrew/bin/rtk](file:///opt/homebrew/bin/rtk) `rtk hook claude --help` — verified RTK 0.39.0 registers as `Bash`-matcher PreToolUse only; 38 verbs in proxy table. Type: installed tool. Credibility: authoritative. Sentiment: neutral.
9. [blog.vincentqiao.com/en/posts/claude-code-settings-hooks](https://blog.vincentqiao.com/en/posts/claude-code-settings-hooks/) — independent deep dive on hook configuration semantics. Type: independent practitioner. Credibility: medium-high. Sentiment: neutral.
10. [claudefa.st/blog/tools/hooks/hooks-guide](https://claudefa.st/blog/tools/hooks/hooks-guide) — community guide to 12 lifecycle events. Type: independent practitioner. Credibility: medium. Sentiment: neutral.
