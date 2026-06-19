---
type: blueprint
title: "Sensitive WP MCP insight and forensics contracts"
owner: ozby
status: planned
complexity: M
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "0% (planned; contract-only PR)"
tags:
  - mcp
  - privacy
  - forensics
  - session-memory
  - planning
---

# Sensitive WP MCP insight and forensics contracts

## Planning Summary

The conversation showed a need for higher-level agent memory and repository forensics: reconstruct what happened across branches/PRs/conversation history, identify useful MCP additions, and summarize current session state. Those tools are high leverage but sensitive. They may inspect transcripts, session memory, GitHub metadata, and local artifacts.

Claude review correctly flagged `wp_repo_forensics` and `wp_session_insight` as undefined and potentially unbounded. This blueprint is contract-first: lock privacy, input, output, and failure boundaries before implementation.

## Scope

### In scope
- Define contracts for `wp_repo_forensics` and `wp_session_insight`.
- Classify allowed data sources and redaction rules.
- Specify bounded output, opt-in scope widening, and failure behavior.
- Decide which parts should remain CLI-only or manual until privacy is proven.

### Out of scope
- Implementing transcript scraping before the privacy contract is accepted.
- Reading secret-bearing files or hidden credentials.
- Sending local transcript/session data to remote services.
- Building a long-lived background indexer.

## Candidate MCP Contracts

```ts
type WpRepoForensicsInput = {
  cwd?: string
  focus: 'branches' | 'prs' | 'ci' | 'commits' | 'all'
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

`wp_repo_forensics` summarizes relevant branches, commits, PRs, CI findings, and suggested next actions. `wp_session_insight` summarizes available local session evidence, confidence, local artifact citations, and redaction warnings. Neither tool may include raw secrets, large diffs, or unbounded logs.

## Privacy and Safety Contract

Allowed by default:
- Git metadata, branch names, commit subjects, PR/check metadata.
- Repo-owned blueprints/docs/source file paths and summarized excerpts.
- Existing `wp_session_*` indexes and summaries.
- Repo-local runtime metadata when present.

Requires explicit opt-in:
- Raw transcript excerpts.
- Large diffs or logs.
- Remote GitHub/GitLab metadata beyond current repo PR/check status.
- Cross-worktree or cross-repo aggregation.

Forbidden:
- Secret-bearing files such as `.env`, `.dev.vars`, credential files, tokens.
- Persisting raw transcript data into tracked repo files.
- Hidden upload/network calls other than explicit GitHub/GitLab status queries.
- Unbounded recursive filesystem scans.

## Side-effect Classification

| Tool | Side effects | Safety rule |
| ---- | ------------ | ----------- |
| `wp_repo_forensics` | Read-only local/remote query | Remote metadata only when `includeRemote: true` |
| `wp_session_insight` | Read-only local artifact/session query | Raw excerpts require explicit `includeRaw: true` |

## Tasks

### Task 1: Data-source inventory and privacy matrix

- [ ] **Status:** todo
- **Depends:** None
- **Files:** blueprint/docs only at first
- **Steps:** Inventory repo-owned session, blueprint, worktree, PR, and CI evidence sources; classify each as default, opt-in, or forbidden; define redaction and output-size limits.
- **Acceptance:** Implementation cannot start until this matrix is reviewed and accepted.

### Task 2: Contract tests before implementation

- [ ] **Status:** todo
- **Depends:** Task 1
- **Files:** planned test specs or skipped implementation test placeholders
- **Steps:** Define fixture cases for secrets, large logs, raw transcript, and remote metadata; specify expected redacted summaries; add no-secret-leak acceptance criteria.
- **Acceptance:** Test plan proves privacy boundaries before any parser is written.

### Task 3: Implementation readiness review

- [ ] **Status:** todo
- **Depends:** Tasks 1, 2
- **Files:** updated blueprint and optional ADR
- **Steps:** Review whether both tools still belong in MCP or should remain CLI/manual, split implementation blueprints if accepted, and mark this planning blueprint complete only after handoff is clear.
- **Acceptance:** This PR lands contracts, not a vague tool implementation.

## Test Plan

- `vp run blueprints:check` for the contract blueprint.
- Future implementation PRs must include privacy fixtures before tool code.
- Future implementation PRs must run secret/path audits and MCP output tests.

## PR Acceptance Criteria

- [ ] Privacy matrix is explicit and conservative.
- [ ] Raw session/transcript access is opt-in, bounded, and redacted.
- [ ] No implementation code is added in this planning PR.
- [ ] Follow-up implementation lanes are split only after contracts are accepted.
