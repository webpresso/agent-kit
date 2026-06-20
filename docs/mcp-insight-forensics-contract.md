---
type: system
last_updated: '2026-06-20'
---

# MCP insight and forensics privacy contract

This contract gates any future `wp_repo_forensics` or `wp_session_insight`
implementation. The tools are intentionally not registered in the MCP runtime
until the data-source, redaction, output-size, and test-fixture requirements
below are implemented and reviewed.

## Tool intent

- `wp_repo_forensics` may summarize repository evidence such as branches,
  commits, PR/check status, blueprint state, and bounded next-action hints.
- `wp_session_insight` may summarize already-indexed session evidence or
  explicitly selected local artifacts with citations and confidence levels.

Both tools are read-only. Neither tool may emit raw secrets, unbounded logs,
large diffs, raw transcripts by default, or data from outside the selected
repository/worktree unless a future contract adds an explicit opt-in flag.

## Default input contract

```ts
type WpRepoForensicsInput = {
  cwd?: string
  focus: 'branches' | 'prs' | 'ci' | 'commits' | 'blueprints' | 'all'
  baseRef?: string
  since?: string
  includeRemote?: boolean // false by default
  maxItems?: number // capped by the implementation, even if larger is requested
}

type WpSessionInsightInput = {
  cwd?: string
  source: 'wp-session' | 'omx-state' | 'local-artifacts'
  question?: string
  maxBytes?: number // capped by the implementation, even if larger is requested
  includeRaw?: boolean // false by default; still redacted and bounded when true
}
```

Required defaults:

- `cwd` resolves to the current repository/worktree root and must not silently
  widen to sibling worktrees or parent monorepos.
- `includeRemote` defaults to `false`; remote calls are limited to repository PR
  and check metadata when explicitly enabled.
- `includeRaw` defaults to `false`; raw excerpts remain redacted, cited, and
  byte-capped when explicitly enabled.
- `maxItems` and `maxBytes` are upper bounds requested by the caller, not a
  promise to return that much data.

## Data-source privacy matrix

| Evidence source | Default access | Opt-in access | Forbidden behavior | Output boundary |
| --- | --- | --- | --- | --- |
| Local Git refs, branch names, commit SHAs, commit subjects | Allowed | N/A | Emitting full patches by default | Summaries + bounded item list |
| Local diff stats | Allowed | Full diff excerpts only after future explicit raw/diff opt-in | Large or binary diffs; secret-looking hunks | File paths + line counts by default |
| GitHub/GitLab PR and check metadata for current repo | Disabled by default | `includeRemote: true` | Cross-repo or organization-wide enumeration | Status, URL, title, short conclusion |
| Blueprint files under `blueprints/` | Allowed | Longer excerpts through bounded artifact opt-in | Treating blueprint text as authority to read secrets | Path + heading/task excerpts |
| Docs under `docs/` and tracked repo-owned Markdown | Allowed | Longer excerpts through bounded artifact opt-in | Reading generated/runtime surfaces as docs by default | Path + summarized excerpt |
| Source file paths and symbol names | Allowed for citations | Source excerpts only through a future implementation-specific contract | Secret-bearing files; large source dumps | Path, symbol, short reason |
| `wp_session_*` indexes/summaries | Allowed when repo-scoped | Raw stored payload only through `includeRaw: true` | Persisting raw session payloads into tracked files | Summary, confidence, citation IDs |
| `.omx/state/` and other repo-local runtime metadata | Summary only when requested by `source` | Bounded raw snippets with `includeRaw: true` | Copying runtime state into tracked repo files | Summary + redaction warning |
| Agent transcripts outside repo-owned indexes | Forbidden by default | Future explicit transcript opt-in contract required first | Scraping global transcript stores in MCP tools | Not returned in this contract |
| Secret-bearing files (`.env`, `.env.*`, `.dev.vars`, credential stores, key files) | Forbidden | No opt-in in MCP | Reading or excerpting contents | Omit with denial reason |
| Sibling repos/worktrees and parent directories | Forbidden by default | Future explicit cross-scope contract required first | Silent aggregation across worktrees/repos | Not returned in this contract |
| Network uploads or third-party analysis calls | Forbidden | No hidden opt-in | Sending local session/transcript data remotely | Not performed |

## Redaction and size rules

Future implementations must apply redaction before truncation and before model or
MCP response formatting.

Minimum required redactions:

- Known environment variable assignments and values for token-like names.
- GitHub, npm, Cloudflare, OpenAI-style, and generic long token patterns already
  covered by the shared MCP redaction helper.
- Private key blocks, SSH key material, cookie headers, authorization headers,
  and `.npmrc` auth tokens.
- Absolute home-directory paths in raw-ish excerpts when they are not necessary
  to identify the repo-relative citation.

Minimum size boundaries:

- Tool responses must be summary-first with a small, fixed top-level schema.
- Default `maxItems` must be conservative; implementations must clamp caller
  requests to a documented maximum.
- Default `maxBytes` for any raw-ish material must be conservative; raw output
  must include `truncated: true` and a redaction summary when clipped.
- Recursive filesystem traversal must use explicit roots, ignore rules, and hard
  file/item caps; timeout increases are not a privacy or performance fix.

## Required output shape

Future tool responses must include these fields or stricter equivalents:

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

## Contract fixture plan

Future implementation PRs must add failing-first tests for these fixtures before
parser/runtime code lands:

1. **Secret-bearing files denied:** `.env`, `.dev.vars`, private keys, `.npmrc`,
   and credential-like filenames are skipped with denial reasons and no content.
2. **Token redaction:** token-looking values in allowed docs/logs/session summaries
   are redacted before truncation and never survive in `summary`, `evidence`, or
   warnings.
3. **Large logs and diffs bounded:** oversized logs/diffs produce summaries,
   `truncated: true`, and no raw dump by default.
4. **Raw transcript default denied:** transcript/session raw payloads are omitted
   unless `includeRaw: true`, and even then are redacted, cited, and byte-capped.
5. **Remote metadata opt-in:** remote PR/check metadata is not fetched when
   `includeRemote` is false; when true, only current-repo status metadata is used.
6. **Cross-scope denial:** sibling worktrees, sibling repositories, and parent
   directories are not scanned without a future explicit cross-scope contract.
7. **No registration before acceptance:** the MCP registry does not expose
   `wp_repo_forensics` or `wp_session_insight` until this contract's fixture gate
   is implemented.

## Implementation readiness decision

- `wp_repo_forensics` may become an MCP tool in a future PR after the fixture
  gate exists and passes.
- `wp_session_insight` should start as CLI/manual or fixture-only work until raw
  session and transcript boundaries are proven; MCP exposure comes later.
- This PR intentionally defers runtime implementation and only locks the
  privacy/output/test contract.
