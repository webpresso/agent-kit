---
title: Session memory guide
type: guide
last_updated: 2026-06-19
---

# Session memory

Session memory gives webpresso agents a local-only recall layer backed by SQLite
and FTS5. It has no daemon, no cloud sync, and no telemetry. Capture hooks write
bounded continuity events, while MCP tools let an agent index, restore, search,
inspect, and safely reset local recall data.

## Native backend and fallback

Published agent-kit builds use a prebuilt-first native loader for the
session-memory engine. The root package declares optional NAPI packages for:

- `darwin-x64`
- `darwin-arm64`
- `linux-x64`
- `linux-arm64`
- `win32-x64`
- `win32-arm64`

The native backend is optional. If no compatible optional package or explicitly
configured addon is available, MCP command execution remains usable through the
TypeScript fallback. Fallback is visible in returned metadata; it is not silent.
The Windows optional packages cover the native SQLite/FTS storage addon surface
only; shell command execution tools still follow the repository's POSIX host
contract and reject `win32` until Windows shell semantics are explicitly
supported.

The published package never runs a synchronous first-use Cargo build. Source
builds are development-only and require both an agent-kit repository checkout
and `WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE=1`. Operators can also point the
loader at a vetted addon with `WP_NATIVE_SESSION_MEMORY_PATH=<path>`.

The native and TypeScript command paths share the same compatibility oracle:
bounded summaries, `124` timeout exits, `128+n` signal exits where known,
indexed-output byte caps, truncation metadata, and local-only storage. Any
future semver-visible divergence must be documented here and in the changeset
that introduces it.

## Data location and reset safety

Session memory uses the webpresso state root and scopes default stores by repo or
worktree key. The exact state root is host-platform specific; docs and examples
use `<state-root>` instead of private machine paths.

Default stores:

- continuity events: `<state-root>/<repo-key>/worktree/<worktree-key>/session-memory/sessions.sqlite`
- indexed chunks: `<state-root>/<repo-key>/worktree/<worktree-key>/session-memory/index.sqlite`

Environment overrides are available for tests and operator recovery:

- `WEBPRESSO_SESSION_MEMORY=0` disables hook capture for a process.
- `WP_SESSION_MEMORY_DB=<path>` overrides the continuity-event store.
- `WP_SESSION_MEMORY_INDEX_DB=<path>` overrides the indexed-chunk store.
- `WP_SESSION_MEMORY_DIR=<dir>` points continuity events at `<dir>/sessions.sqlite`.

Use `wp_session_purge` for resets. It defaults to a dry run, requires
`confirm: true` to delete records, and rejects an unscoped confirmed global
purge unless `allowGlobal: true` is also supplied.

## Registered MCP tools

The compiled MCP registry exposes these tested session-memory tools:

| Tool                         | Purpose                                                                                                                                          | Bounds and safety                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wp_session_batch_execute`   | Run an explicit bounded batch of shell commands through session-memory execution (native backend when available, TypeScript fallback otherwise). | Requires explicit execute consent, caps concurrency/time/summary size, and indexes output instead of returning large raw payloads inline.                             |
| `wp_session_capture`         | Manually capture continuity content for later restore.                                                                                           | Truncates captured content before storage and records it under the active repo/session identity.                                                                      |
| `wp_session_index`           | Index caller-provided text chunks.                                                                                                               | Accepts at most 100 chunks per call, skips empty or oversized chunks, and returns bounded chunk ids and warnings.                                                     |
| `wp_session_fetch_and_index` | Fetch an absolute `http(s)` URL and index bounded response content.                                                                              | Caps URL length, response bytes, chunk count, and returned ids; failed fetches return bounded warnings.                                                               |
| `wp_session_execute`         | Run one explicit shell command through session-memory execution (native backend when available, TypeScript fallback otherwise).                  | Requires explicit execute consent, caps timeout/summary size, and returns bounded summaries plus optional indexed search hits.                                        |
| `wp_session_execute_file`    | Run explicit local file `read_text` or `metadata` operations under repo-root validation.                                                         | Caps preview and file bytes; overflow content can be indexed instead of returned inline; no shell, write, network path, or repo escape behavior is part of this tool. |
| `wp_session_retrieve`        | Retrieve exact elided content by handle id.                                                                                                      | Accepts an elision `id`, optional `cwd`, and bounded `maxBytes`; no public database path override is exposed. Use when `elisions[]` is present.                       |
| `wp_session_restore`         | Restore bounded continuity context for the active repo.                                                                                          | Defaults to continuity events, returns preview-only results, and caps result count and preview bytes.                                                                 |
| `wp_session_search`          | Search indexed chunks plus continuity events with unified provenance.                                                                            | Prioritizes indexed chunks, dedupes results, caps result count, and returns bounded previews.                                                                         |
| `wp_session_snapshot`        | Create a typed session-memory snapshot before risky operations or branch switches.                                                               | Caps snapshot work and reports partial snapshots instead of hanging.                                                                                                  |
| `wp_session_stats`           | Report local continuity and index counts.                                                                                                        | Read-only; returns counts and bounded source lists.                                                                                                                   |
| `wp_session_purge`           | Dry-run or explicitly confirm scoped local purge operations.                                                                                     | Dry-run by default; scoped deletion requires `confirm: true`; unscoped deletion also requires `allowGlobal: true`.                                                    |
| `wp_session_doctor`          | Report bounded local diagnostics for continuity and index stores.                                                                                | Read-only; corrupt or locked stores become bounded warnings instead of transport hangs.                                                                               |

## Gain reporting

Instrumented session-memory tools report exact UTF-8 byte gains for a declared
raw byte basis. The canonical token number is an approximation only:
`Math.floor(gainBytes / 4)`.

The `structuredContent.gain` object contains:

- `rawBasisBytes` — exact UTF-8 bytes in the declared raw basis.
- `returnedToolResultBytes` — exact UTF-8 bytes of the final MCP tool result
  object, including `content`, `structuredContent`, and gain telemetry.
- `gainBytes` — `Math.max(0, rawBasisBytes - returnedToolResultBytes)`.
- `approxTokensSaved` — `Math.floor(gainBytes / 4)`.
- `precision` — `exact_utf8_bytes_approx_tokens`.
- `rawBytesBasis` — one of `command_output_total`,
  `batch_command_output_total`, `file_read_buffer`, `file_metadata_buffer`,
  `index_accepted_text`, or `fetch_indexed_text`.

`wp_session_stats` reports current-worktree Webpresso gain totals from the
session-memory index DB. `wp gain` prints those Webpresso totals and then prints
RTK `gain --format json` totals in a separate section; the two sources are never
merged.

## Examples

Index direct notes:

```json
{
  "tool": "wp_session_index",
  "arguments": {
    "source": "operator-notes",
    "chunks": [
      {
        "text": "The release gate depends on green reference parity smoke checks.",
        "metadata": { "kind": "note" }
      }
    ]
  }
}
```

Restore continuity context for a repo-scoped session:

```json
{
  "tool": "wp_session_restore",
  "arguments": {
    "cwd": ".",
    "query": "release gate",
    "limit": 5,
    "maxPreviewBytes": 1024
  }
}
```

Search all indexed and continuity sources:

```json
{
  "tool": "wp_session_search",
  "arguments": {
    "cwd": ".",
    "query": "reference parity smoke",
    "sourceTypes": ["indexed_chunk", "continuity_event"],
    "limit": 10
  }
}
```

Preview a scoped reset without deleting anything:

```json
{
  "tool": "wp_session_purge",
  "arguments": {
    "target": "indexed_chunks",
    "source": "operator-notes"
  }
}
```

Confirm the same scoped reset:

```json
{
  "tool": "wp_session_purge",
  "arguments": {
    "target": "indexed_chunks",
    "source": "operator-notes",
    "confirm": true
  }
}
```

## Event flow

1. `SessionStart` restores and injects bounded continuity context for the
   current repo. It does not create a capture event by itself.
2. `PostToolUse`, `UserPromptSubmit`, `Stop`, and supported `PreCompact` paths
   capture typed continuity events with repo, session, event type, timestamp,
   bounded content, summary, priority, and metadata fields.
3. The repo hash scopes continuity recall to the current repository.
4. Events are appended to `session_events` with WAL enabled so multiple local
   handles can write safely. The hard-cut schema requires typed continuity
   events; untyped event rows are rejected instead of being inferred.
5. Snapshot points consolidate events into `sessions` rows. If a cap is reached,
   the snapshot is marked `partial` instead of blocking the agent.
6. Restore and search tools return top-ranked preview snippets with provenance.

## Operator recovery and release gates

For local recovery, first inspect data with `wp_session_stats` and
`wp_session_doctor`, then preview scoped deletion with `wp_session_purge` before
using `confirm: true`. Prefer a scoped `source`, `cwd`, or target-specific purge;
global deletion requires both `confirm: true` and `allowGlobal: true`.

Run these gates before shipping hook-bin, session-continuity, or public docs
changes that mention this guide:

```bash
./bin/wp hooks doctor --skip-mcp
./bin/wp audit blueprint-lifecycle
./bin/wp audit reference-parity-matrix --json
./bin/wp audit package-surface
npm pack --dry-run --json
vp run lint:pkg
vp run verify:secrets
./bin/wp audit secrets-policy
./bin/wp audit no-dev-vars
./bin/wp audit secret-provider-quarantine
./bin/wp audit secrets-config
vp run verify:paths
```

The `reference-parity-matrix --json` gate validates the matrix and exposes `releaseClaimGateReady`; run `./bin/wp audit reference-parity-matrix --strict` only when promoting public replacement-parity claims, because it intentionally fails while release-required rows remain open or degraded.

The gates prove hook health, blueprint lifecycle state, reference parity gating,
package-surface policy, real pack tarball contents, package lint, the dev-var
carrier check, secret-policy audits, and path safety. Public claims
should cite the reference parity matrix and must stay within the documented
Cursor/OpenCode degraded support boundary.

Native package changes also require:

```bash
vp run build:session-memory-native -- --target host
vp run stage:session-memory-native -- --target host
vp run native:session-memory:fmt
vp run native:session-memory:clippy
vp run native:session-memory:deny
vp run native:session-memory:test
vp run native:session-memory:bench:run
vp run native:session-memory:bench:gate
vp run public:readiness
vp run public:consumer-smoke:setup
```

The packed-consumer smoke inspects the actual tarball and fails if
`native/session-memory-engine/**`, `Cargo.toml`, or `Cargo.lock` leak into the
consumer package. It requires the compiled native loader JS so a consumer can
resolve a prebuilt optional addon or take the TypeScript fallback without Rust
sources.

Use `public:readiness` for the fast local package/readme/policy gate, and
`public:consumer-smoke:setup` for the slower packed-install proof.

## Fetch and index flow

`wp_session_fetch_and_index` uses native `fetch()`, normalizes URLs, converts
HTML to text-like chunks, formats JSON, and indexes chunks into the same FTS
search store. It only accepts absolute `http(s)` URLs and stores bounded chunks
locally.

## Schema

### `session_memory_chunks`

- `id` — deterministic chunk id
- `source` — URL, file, or logical source
- `text` — indexed body text
- `metadata_json` — structured metadata such as URL and chunk index
- `created_at` — ISO timestamp

FTS tables:

- `session_memory_chunks_fts` — porter tokenizer for normal keyword search
- `session_memory_chunks_tri` — trigram tokenizer for partial-token fallback

### `session_events`

- `session_id`
- `event_id`
- `repo_hash`
- `ts`
- `event_type`
- `tool_name`
- `content`
- `summary`
- `priority`
- `metadata_json`

### `sessions`

- `agent_id`
- `snapshot_id`
- `repo_hash`
- `created_at`
- `status` (`complete` or `partial`)
- `content_json`

## Search fallback

The store uses a three-tier fallback: porter FTS first, trigram FTS second, and
a capped Levenshtein pass last. Results include unified provenance so an agent
can distinguish continuity events from indexed chunks.

## Unsupported modes and non-goals

- Session memory is local-only; it is not a shared team database or cloud sync
  service.
- MCP tools do not make replacement parity claims by themselves. Public claims
  must point at the reference parity proof lane.
- File execution is limited to explicit read/metadata operations under repo-root
  validation; arbitrary shell execution is not part of this surface.
- Upgrade, dashboard, and help tools are not shipped until they have tested
  handlers and registry coverage.
