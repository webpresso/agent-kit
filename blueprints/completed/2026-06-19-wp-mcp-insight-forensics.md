---
type: blueprint
title: "Sensitive WP MCP insight and forensics contracts"
owner: ozby
status: completed
complexity: M
created: "2026-06-19"
last_updated: "2026-06-20"
completed_at: "2026-06-20"
progress: "100% (3 of 3 contract tasks completed; runtime implementation deferred)"
tags:
  - mcp
  - privacy
  - forensics
  - session-memory
  - planning
---

# Sensitive WP MCP insight and forensics contracts

## Planning Summary

The conversation showed a need for higher-level agent memory and repository
forensics: reconstruct what happened across branches/PRs/conversation history,
identify useful MCP additions, and summarize current session state. Those tools
are high leverage but sensitive. They may inspect transcripts, session memory,
GitHub metadata, and local artifacts.

Claude review correctly flagged `wp_repo_forensics` and `wp_session_insight` as
undefined and potentially unbounded. This blueprint is contract-first: lock
privacy, input, output, and failure boundaries before implementation.

This PR completes the contract lane only. Runtime MCP implementation is deferred
until a future PR adds the required fixture gate and explicitly updates the MCP
registration guardrail.

## Product wedge anchor

Agent-kit should make repository and session context easier to recover without
turning local transcripts, runtime state, or credentials into accidental public
MCP output. The wedge is useful, cited, summary-first forensics with conservative
privacy defaults.

## Scope

### In scope

- Define contracts for `wp_repo_forensics` and `wp_session_insight`.
- Classify allowed data sources and redaction rules.
- Specify bounded output, opt-in scope widening, and failure behavior.
- Decide which parts should remain CLI-only or manual until privacy is proven.
- Add a guardrail test proving the sensitive MCP tools are not registered in
  this contract-only PR.

### Out of scope

- Implementing `wp_repo_forensics` or `wp_session_insight` runtime tools.
- Implementing transcript scraping before the privacy contract is accepted.
- Reading secret-bearing files or hidden credentials.
- Sending local transcript/session data to remote services.
- Building a long-lived background indexer.
- Cross-worktree, cross-repo, or organization-wide aggregation.

## Contract Deliverables

| Deliverable | Location | Status |
| --- | --- | --- |
| Privacy/output contract | [`docs/mcp-insight-forensics-contract.md`](../../docs/mcp-insight-forensics-contract.md) | Complete |
| Data-source inventory and privacy matrix | [`docs/mcp-insight-forensics-contract.md#data-source-privacy-matrix`](../../docs/mcp-insight-forensics-contract.md#data-source-privacy-matrix) | Complete |
| Redaction and size rules | [`docs/mcp-insight-forensics-contract.md#redaction-and-size-rules`](../../docs/mcp-insight-forensics-contract.md#redaction-and-size-rules) | Complete |
| Fixture/test plan | [`docs/mcp-insight-forensics-contract.md#contract-fixture-plan`](../../docs/mcp-insight-forensics-contract.md#contract-fixture-plan) | Complete |
| Runtime registration guardrail | `src/mcp/tools/_registry.test.ts` | Complete |

## Candidate MCP Contracts

```ts
type WpRepoForensicsInput = {
  cwd?: string
  focus: 'branches' | 'prs' | 'ci' | 'commits' | 'blueprints' | 'all'
  baseRef?: string
  since?: string
  includeRemote?: boolean
  maxItems?: number
}

type WpSessionInsightInput = {
  cwd?: string
  source: 'wp-session' | 'omx-state' | 'local-artifacts'
  question?: string
  maxBytes?: number
  includeRaw?: boolean
}
```

Required defaults:

- `cwd` resolves to the current repository/worktree and does not silently widen.
- `includeRemote` defaults to `false`; remote metadata is current-repo PR/check
  status only when explicitly enabled.
- `includeRaw` defaults to `false`; raw-ish excerpts are still redacted,
  cited, and byte-capped when explicitly enabled.
- `maxItems` and `maxBytes` are caller-requested upper bounds and must be
  clamped by implementation-defined maximums.

`wp_repo_forensics` summarizes relevant branches, commits, PRs, CI findings,
blueprint state, and suggested next actions. `wp_session_insight` summarizes
available local session evidence, confidence, local artifact citations, and
redaction warnings. Neither tool may include raw secrets, large diffs, or
unbounded logs.

## Privacy and Safety Contract

Allowed by default:

- Git metadata, branch names, commit SHAs, and commit subjects.
- Repo-owned blueprint/doc/source paths and summarized, bounded excerpts.
- Existing repo-scoped `wp_session_*` indexes and summaries.
- Repo-local runtime metadata summaries when the caller selects that source.

Requires explicit opt-in:

- Remote PR/check metadata for the current repo via `includeRemote: true`.
- Bounded raw-ish excerpts via `includeRaw: true`, after redaction and byte caps.
- Longer doc/blueprint excerpts through future implementation-specific bounds.

Forbidden in this contract:

- Secret-bearing files such as `.env`, `.env.*`, `.dev.vars`, `.npmrc`, private
  keys, credential files, and token stores.
- Raw transcript scraping from global/non-repo stores.
- Persisting raw transcript or runtime data into tracked repo files.
- Hidden upload/network calls other than explicit current-repo PR/check status
  queries.
- Unbounded recursive filesystem scans.
- Silent cross-worktree or cross-repo aggregation.

## Data-Source Inventory and Privacy Matrix

| Evidence source | Default | Opt-in | Forbidden | Output boundary |
| --- | --- | --- | --- | --- |
| Local Git refs/branches/commit subjects | Allowed | N/A | Full patches by default | Bounded list + summary |
| Local diff stats | Allowed | Full diff excerpts require future raw/diff opt-in | Large/binary/secret-looking hunks | File paths + line counts |
| Current-repo PR/check metadata | Denied by default | `includeRemote: true` | Cross-repo/org enumeration | URL, title, state, conclusion |
| Blueprints under `blueprints/` | Allowed | Bounded longer excerpts | Using blueprint text to justify secret reads | Path + task/heading excerpts |
| Docs and tracked repo Markdown | Allowed | Bounded longer excerpts | Generated/runtime surfaces as default docs | Path + summary |
| Source paths/symbol names | Allowed | Source excerpts require future source-excerpt contract | Secret-bearing files; source dumps | Path/symbol citation only |
| `wp_session_*` indexes/summaries | Allowed when repo-scoped | Raw stored payload via `includeRaw: true` | Persisting raw payloads | Summary + citation IDs |
| `.omx/state/` and repo-local runtime metadata | Summary only when selected | Bounded raw snippets via `includeRaw: true` | Copying runtime state to tracked files | Summary + warnings |
| Agent transcripts outside repo indexes | Forbidden | Future explicit transcript contract required | Global transcript scraping | Not returned |
| Secret-bearing files/credential stores | Forbidden | No MCP opt-in | Reading/excerpting contents | Denial reason only |
| Sibling repos/worktrees/parent dirs | Forbidden | Future cross-scope contract required | Silent aggregation | Not returned |
| Network uploads/third-party analysis | Forbidden | No hidden opt-in | Sending local session data remotely | Not performed |

## Output Contract

Future implementations must return a summary-first schema equivalent to:

```ts
type SensitiveInsightResponse = {
  summary: string
  evidence: Array<{
    source: 'git' | 'remote-pr' | 'remote-ci' | 'blueprint' | 'doc' | 'session-index' | 'runtime-state' | 'local-artifact'
    citation: string
    excerpt?: string
    redacted?: boolean
  }>
  warnings: string[]
  denied: Array<{ source: string; reason: string }>
  limits: { maxItems: number; maxBytes?: number; truncated: boolean }
  confidence: 'low' | 'medium' | 'high'
  nextActions: string[]
}
```

Output rules:

- Redact before truncating and before response formatting.
- Include `denied` entries rather than silently reading forbidden sources.
- Include `limits.truncated: true` whenever caps affected output.
- Prefer citations and summaries over raw text.
- Never emit raw secrets, raw global transcripts, or unbounded logs.

## Side-effect Classification

| Tool | Side effects | Safety rule |
| ---- | ------------ | ----------- |
| `wp_repo_forensics` | Read-only local/remote query | Remote metadata only when `includeRemote: true`; current repo only |
| `wp_session_insight` | Read-only local artifact/session query | Raw excerpts require `includeRaw: true`, redaction, and hard byte caps |

## Phases

### Phase 1: Contract lock [Complexity: M]

#### [privacy] Task 1.1: Data-source inventory and privacy matrix

- [x] **Status:** done
- **Depends on:** —
- **Files:** `blueprints/completed/2026-06-19-wp-mcp-insight-forensics.md`, `docs/mcp-insight-forensics-contract.md`
- **Change:** Inventory repo-owned session, blueprint, worktree, PR, and CI
  evidence sources; classify each as default, opt-in, or forbidden; define
  redaction and output-size limits.
- **Verify:** `vp run blueprints:check`; `vp run docs:check`
- **Acceptance:** Implementation cannot start until this matrix is reviewed and
  accepted; this PR records the accepted matrix and keeps runtime code deferred.

#### [tests] Task 1.2: Contract tests before implementation

- [x] **Status:** done
- **Depends on:** Task 1.1
- **Files:** `docs/mcp-insight-forensics-contract.md`, `src/mcp/tools/_registry.test.ts`
- **Change:** Define fixture cases for secrets, large logs, raw transcripts,
  remote metadata, cross-scope denial, and no-secret-leak acceptance; add a
  registry guardrail proving the tools are not exposed before fixture-backed
  implementation.
- **Verify:** `./node_modules/.bin/vitest run src/mcp/tools/_registry.test.ts --exclude '**/*.integration.test.ts' --exclude '**/*.e2e.test.ts'`
- **Acceptance:** Test plan proves privacy boundaries before any parser is
  written; runtime registration remains blocked until a future PR updates this
  guardrail with fixture evidence.

#### [readiness] Task 1.3: Implementation readiness review

- [x] **Status:** done
- **Depends on:** Tasks 1.1, 1.2
- **Files:** `blueprints/completed/2026-06-19-wp-mcp-insight-forensics.md`, `docs/mcp-insight-forensics-contract.md`
- **Change:** Decide whether both tools belong in MCP immediately or should
  remain CLI/manual until privacy is proven; record follow-up gates.
- **Verify:** `vp run blueprints:check`; `vp run docs:check`
- **Acceptance:** This PR lands contracts, not a vague tool implementation.

## Implementation Readiness Decision

- `wp_repo_forensics` may become an MCP tool in a future PR only after the
  fixture gate in the contract doc is implemented and passing.
- `wp_session_insight` should start as CLI/manual or fixture-only work until raw
  session/transcript boundaries are proven; MCP exposure comes later.
- Future implementation PRs must update or remove the registry guardrail only in
  the same change that adds privacy fixtures and redaction/output tests.

## Verification Gates

Completed for this PR:

- `vp run blueprints:check`
- `vp run docs:check`
- `./node_modules/.bin/vitest run src/mcp/tools/_registry.test.ts --exclude '**/*.integration.test.ts' --exclude '**/*.e2e.test.ts'`

Required for future implementation PRs:

- Secret/path audits (`vp run verify:secrets`, `vp run verify:paths`).
- MCP output tests proving no secret leaks in `summary`, `evidence`, `warnings`,
  `denied`, or `nextActions`.
- Fixture tests for raw transcript denial, bounded raw opt-in, large log/diff
  truncation, remote opt-in behavior, and cross-scope denial.
- Registry exposure only after the fixture gate passes.

## PR Acceptance Criteria

- [x] Privacy matrix is explicit and conservative.
- [x] Raw session/transcript access is opt-in, bounded, and redacted.
- [x] No implementation code is added in this planning PR.
- [x] Follow-up implementation lanes are deferred until contracts are accepted.
- [x] Guardrail test confirms `wp_repo_forensics` and `wp_session_insight` are
  not registered in this contract-only PR.
