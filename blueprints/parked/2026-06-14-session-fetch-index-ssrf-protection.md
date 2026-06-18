---
type: blueprint
title: Session fetch-index SSRF protection
owner: ozby
status: parked
complexity: S
created: '2026-06-14'
last_updated: '2026-06-15'
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - ssrf
  - session-memory
  - fetch
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Session fetch-index SSRF protection

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.


**Goal:** Ensure `wp_session_fetch_and_index` rejects internal/cloud-metadata endpoints — including literal IPs, hostnames that resolve to internal addresses, and canonical IPv6/IPv4-mapped encodings — while preserving legitimate external documentation fetching.

## Product wedge anchor

- **Stage outcome:** Hardens the session-memory MCP surface (the `wp_*` dev-workflow lane shipped to Tier 1 Claude Code / Codex consumers) against SSRF before consumers trust `wp_session_fetch_and_index` with attacker-influenced URLs in shared/CI contexts.
- **Consuming surface:** The `wp_session_fetch_and_index` MCP tool (`src/mcp/tools/session-fetch-and-index.ts`), which delegates all network fetches to `fetchAndIndex` in `src/session-memory/fetch-index.ts`.
- **Current source reality:** The first-pass SSRF guard is already in the repo: `src/session-memory/ip-guard.ts`, `src/session-memory/ip-guard.test.ts`, `FetchIndexErrorCode: 'blocked_host'`, `FetchAndIndexOptions.allowedHosts`, and MCP `blocked_host` warning handling exist. This blueprint now tracks the remaining correctness hardening needed before claiming the protection complete.
- **New user-visible capability:** A consumer can call `wp_session_fetch_and_index` on an untrusted URL and have internal/cloud-metadata targets rejected by default, instead of silently probing the internal network.

`wp_session_fetch_and_index` is the only user-facing fetch surface in session-memory. If an attacker controls the URL input (via MCP or a compromised agent), they can probe internal networks and cloud metadata services. The narrow choke point is `fetchAndIndex`: it normalizes the URL, checks the hostname through `isInternalHost`, and only then calls `fetch`. DNS resolution is part of the default guard, not an opt-in. `allowedHosts` remains a code-level/internal bypass only; MCP callers cannot self-allowlist.

## Quick Reference (Execution Waves)

| Wave              | Tasks          | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | -------------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1            | None         | 1 agent        | S                |
| **Wave 1**        | 1.2, 1.3       | Task 1.1     | 2 agents       | XS-S             |
| **Critical path** | 1.1 → 1.2      | —            | 2 waves        | S                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual | Notes |
| ------ | ---------------------------------- | -------------------- | ------ | ----- |
| RW0    | Ready tasks in Wave 0              | ≥ 3                  | 1      | Address-policy semantics must land before dependent tests/docs can be finalized. |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 1.5    | Improved from the stale 3-task serial plan; still intentionally narrow because this is a small security hardening patch. |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 0.67   | 2 dependency edges / 3 tasks. |
| CP     | same-file overlaps per wave        | 0                    | 0      | Wave 1 splits fetch/MCP tests from blueprint/docs validation. |

**Parallelization score: C.** The first-pass plan was effectively already implemented in the repo. The remaining work has one real sequencing point (address classification contract before downstream integration assertions), after which two tasks can run in parallel. Further splitting would create artificial subtasks with little independent test value.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Blueprint Fix |
| -- | -------- | ----- | ---------------- | ------------- |
| F1 | HIGH | `normalizeUrl` does not block private IPs. | **Stale.** Current `src/session-memory/fetch-index.ts:199-225` calls `isInternalHost(parsed.hostname, { signal, timeoutMs })` before fetch and throws `blocked_host`. | Treat SSRF guard as existing source and plan residual hardening only. |
| F2 | HIGH | Cloud metadata endpoint `169.254.169.254` is reachable. | **Stale.** Current `src/session-memory/fetch-index.test.ts` covers `http://169.254.169.254/latest/meta-data/` rejection before `fetchImpl` is called. | Keep metadata regression coverage and add canonical encoding variants. |
| F3 | LOW | URL credentials are rejected. | Confirmed at `src/session-memory/fetch-index.ts:67-81`; credentials still raise `invalid_url`. | No action. |
| F4 | MEDIUM | `FetchAndIndexOptions` lives in `types.ts`. | Corrected: `FetchAndIndexOptions` lives in `src/session-memory/fetch-index.ts:37-48`; store-layer `FetchIndexOptions` is separate in `types.ts`. | Keep allowlist changes local to `fetch-index.ts`. |
| F5 | LOW | `FetchIndexErrorCode` already includes `invalid_url`. | Confirmed; current source also already includes `blocked_host` at `src/session-memory/fetch-index.ts:7-16` and MCP warning handling at `src/mcp/tools/session-fetch-and-index.ts:124-147`. | Preserve `blocked_host` as distinct from malformed URL failures. |
| F6 | HIGH | Static literal-IP blocking is sufficient SSRF protection. | Corrected by current source: `isInternalHost` resolves non-literal hostnames via `dns.promises.lookup(hostname, { all: true })` and fails closed on lookup error (`src/session-memory/ip-guard.ts:131-144`). | Keep DNS resolution default and bounded by timeout/signal. |
| F7 | HIGH | IPv6-mapped IPv4 protection covers canonical URL forms. | **Gap.** Node canonicalizes `http://[::ffff:127.0.0.1]/` to hostname `[::ffff:7f00:1]`. Current `ipv4MappedIpv6Suffix()` only recognizes dotted suffixes (`::ffff:127.0.0.1`), so canonical hex-mapped loopback/link-local/private IPv4 forms need explicit tests and parsing. | Task 1.1 adds canonical IPv4-mapped IPv6 decoding and tests. |
| F8 | MEDIUM | Blocking only RFC1918/loopback/link-local/ULA is enough for SSRF. | Partial. Current `isInternalIpv4()` blocks `0/8`, `10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, but not CGNAT `100.64/10`, benchmark `198.18/15`, or other special-use/non-global ranges. For an SSRF guard, default-deny should cover non-global/special-use addresses unless explicitly allowlisted. | Task 1.1 expands the address policy and documents any intentionally allowed public ranges. |

## Tasks

#### [security] Task 1.1: Harden `isInternalHost` address classification

**Status:** done

**Depends:** None

Strengthen the existing SSRF guard in `src/session-memory/ip-guard.ts`. The current implementation already handles common private IPv4 ranges, loopback/link-local IPv6, `localhost`, DNS lookup, timeout bounding, and fail-closed DNS errors. This task closes the remaining evasion gap for canonical IPv4-mapped IPv6 forms such as `[::ffff:7f00:1]` and broadens the guard to reject non-global/special-use IPv4 ranges that should not be fetched by an untrusted documentation indexer.

**Files:**

- Modify: `src/session-memory/ip-guard.ts`
- Modify: `src/session-memory/ip-guard.test.ts`

**Steps (TDD):**

1. Write failing tests in `ip-guard.test.ts` for canonical IPv4-mapped IPv6 hostnames produced by `URL`, including `[::ffff:7f00:1]` (127.0.0.1), `[::ffff:a9fe:a9fe]` (169.254.169.254), and `[::ffff:c0a8:0101]` (192.168.1.1).
2. Write failing tests for additional blocked IPv4 special-use ranges needed for SSRF default-deny: at minimum `100.64.0.1`, `198.18.0.1`, `192.0.0.1`, `192.0.2.1`, `198.51.100.1`, and `203.0.113.1`. Keep `8.8.8.8` as an allowed public-control case.
3. Run: `./bin/wp test --file src/session-memory/ip-guard.test.ts` — verify FAIL.
4. Implement minimal parsing in `ip-guard.ts`: decode both dotted and hex IPv4-mapped IPv6 suffixes, then reuse the IPv4 range classifier; extend the IPv4 classifier for the tested special-use ranges. Do not add a new dependency unless manual parsing becomes materially more complex than the existing helper.
5. Run: `./bin/wp test --file src/session-memory/ip-guard.test.ts` — verify PASS.
6. Run: `./bin/wp lint --file src/session-memory/ip-guard.ts --file src/session-memory/ip-guard.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] `isInternalHost('[::ffff:7f00:1]')`, `isInternalHost('[::ffff:a9fe:a9fe]')`, and `isInternalHost('[::ffff:c0a8:0101]')` resolve `true` without DNS lookup.
- [x] `isInternalHost('100.64.0.1')`, `isInternalHost('198.18.0.1')`, `isInternalHost('192.0.0.1')`, `isInternalHost('192.0.2.1')`, `isInternalHost('198.51.100.1')`, and `isInternalHost('203.0.113.1')` resolve `true`.
- [x] Existing accepted public controls (`8.8.8.8`, `2001:4860:4860::8888`, `example.com` with public DNS mock) still resolve `false`.
- [x] DNS lookup still checks every returned address and still fails closed on lookup error.
- [x] No new runtime dependency is introduced unless the implementation note explains why it is simpler and safer than manual parsing.

---

#### [session-memory] Task 1.2: Add fetch-layer regression tests for canonical internal encodings

**Status:** done

**Depends:** Task 1.1

Extend `fetchAndIndex` coverage so the hardened address policy is proven at the actual fetch boundary, not only inside the helper. The current source already normalizes URLs, blocks internal hosts before `fetchImpl`, supports `allowedHosts`, and returns `blocked_host`; this task adds regression tests for canonical URL encodings that previously could bypass helper-level assumptions.

**Files:**

- Modify: `src/session-memory/fetch-index.test.ts`

**Steps (TDD):**

1. Add failing tests that call `fetchAndIndex` with `http://[::ffff:127.0.0.1]/`, `http://[::ffff:169.254.169.254]/`, and representative special-use IPv4 URLs from Task 1.1; assert rejection with code `blocked_host` and assert `fetchImpl` was not called.
2. Add/keep a control test for `https://example.com/docs` to confirm legitimate external documentation fetching still indexes content.
3. Run: `./bin/wp test --file src/session-memory/fetch-index.test.ts` — verify FAIL before Task 1.1 lands, then PASS after Task 1.1 lands.
4. Confirm `allowedHosts` remains exact-host only: `allowedHosts: ['localhost']` bypasses `http://localhost/path`, but does not wildcard-match `sub.localhost` or unrelated private hosts.
5. Run: `./bin/wp lint --file src/session-memory/fetch-index.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Canonical IPv4-mapped IPv6 loopback/private/link-local URLs are rejected with `FetchIndexError` code `blocked_host` before network fetch.
- [x] Representative special-use IPv4 URLs from Task 1.1 are rejected with `blocked_host` before network fetch.
- [x] `https://example.com/docs` remains allowed and indexes chunks.
- [x] `allowedHosts` remains an explicit exact-host bypass only; no wildcard/glob behavior is introduced.
- [x] Existing fetch-index tests still pass (valid URLs, credential rejection, body limits, timeout/abort, JSON/HTML/text handling).

---

#### [integration] Task 1.3: Verify MCP warning behavior and lifecycle evidence

**Status:** done

**Depends:** Task 1.1

Confirm the MCP tool still surfaces hardened host rejections as user-meaningful errors and update the blueprint lifecycle evidence after implementation. The MCP tool already delegates to `fetchAndIndex` and already has a `blocked_host` warning branch, so this task should be mostly test coverage and verification rather than new production logic.

**Files:**

- Modify: `src/mcp/tools/session-fetch-and-index.test.ts`
- Modify: `blueprints/planned/2026-06-14-session-fetch-index-ssrf-protection.md`

**Steps (TDD):**

1. Add failing MCP test for a canonical internal encoding such as `http://[::ffff:127.0.0.1]/`; expect `isError: true`, summary `session fetch/index rejected blocked host`, and a warning mentioning the internal-host block.
2. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` — verify FAIL before Task 1.1 lands, then PASS after Task 1.1 lands.
3. Confirm existing MCP tests for metadata IPs, loopback/private IPv4, external URLs, empty content, timeout/abort, and invalid URLs still pass.
4. After implementation is verified, update this blueprint’s progress/status evidence only (do not edit unrelated blueprints).
5. Run: `./bin/wp audit blueprint-lifecycle`.

**Acceptance:**

- [x] Canonical IPv4-mapped internal URLs through `wp_session_fetch_and_index` return `isError: true` with the `blocked_host` summary/warning.
- [x] Existing MCP tool behavior remains unchanged for external URLs, invalid URLs, empty content, timeout, and abort cases.
- [x] Blueprint progress/lifecycle fields reflect the final implementation state after tests pass.
- [x] `./bin/wp audit blueprint-lifecycle` passes or the blocker is recorded with command output.

---

## Edge Cases

| ID | Case | Handling | Severity |
| -- | ---- | -------- | -------- |
| E1 | DNS rebinding: hostname resolves to public IP at check time, private IP at fetch time | Mitigated by resolving at request time inside `isInternalHost` and validating every returned address. Residual TOCTOU window between lookup and fetch remains a documented non-goal. | MEDIUM |
| E2 | IPv6-mapped IPv4 dotted form (`::ffff:127.0.0.1`) | Existing tests cover dotted form; keep it blocked without DNS lookup. | MEDIUM |
| E3 | IPv6-mapped IPv4 canonical hex form (`[::ffff:7f00:1]`) | Task 1.1 decodes canonical hex-mapped IPv4 suffixes before applying IPv4 policy. | HIGH |
| E4 | Hostname with trailing dot (`localhost.`) | Existing `normalizeHostname` strips trailing dots; keep regression coverage. | LOW |
| E5 | IDN/punycode hostnames | `URL.hostname` returns punycode; DNS resolution covers the post-resolution IP regardless. | LOW |
| E6 | `0.0.0.0` as hostname | Existing IPv4 policy blocks `0/8`; keep `0.0.0.0` coverage. | LOW |
| E7 | Bracketed IPv6 host (`[::1]`) | Existing normalization strips brackets before `net.isIP()`/range checks. | MEDIUM |
| E8 | Allowlist bypass with wildcards | Explicit exact hostnames only in `allowedHosts`; no glob/wildcard matching. | MEDIUM |
| E9 | `wp_session_fetch_and_index` does not expose `allowedHosts` to callers | By design — `allowedHosts` is a code-level opt-in for internal callers. MCP callers cannot self-allowlist. | LOW |
| E10 | Special-use/non-global IPv4 ranges not covered by RFC1918 | Task 1.1 blocks representative special-use ranges (`100.64/10`, `198.18/15`, documentation/test nets, and `192.0.0.0/24`) to avoid non-public network probing. | MEDIUM |
| E11 | DNS lookup failure for legitimate public documentation host | Current source fails closed by returning `true` from `isInternalHost` on lookup error. This favors SSRF safety over availability; warning remains generic `blocked_host`. | MEDIUM |

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| DNS rebinding bypasses the check via a TOCTOU window | DNS resolution is default inside `isInternalHost`, but the residual lookup-to-fetch gap is out of scope unless a future plan pins resolved IPs into the socket/agent. |
| Canonical IPv4-mapped IPv6 encodings bypass dotted-suffix checks | Task 1.1 adds hex-suffix decoding and fetch/MCP regression tests. |
| Over-blocking special-use ranges prevents a legitimate local/operator fetch | Keep `allowedHosts` as an exact-host code-level bypass; MCP remains default-deny. |
| DNS lookup latency on the fetch path | Lookup is bounded with timeout/signal; do not raise global timeouts as a fix. |
| Public-package dependency creep | Prefer extending the existing helper without adding a dependency; if a dependency is introduced, run package-surface/tarball checks because this is a public package. |

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit tests (ip-guard) | `./bin/wp test --file src/session-memory/ip-guard.test.ts` | Pass with canonical IPv4-mapped and special-use range coverage. |
| Unit tests (fetch-index) | `./bin/wp test --file src/session-memory/fetch-index.test.ts` | Pass with blocked-host regressions and existing fetch behaviors. |
| MCP integration | `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` | Pass with meaningful `blocked_host` warning behavior. |
| Full suite | `./bin/wp test` | All tests pass, no regressions. |
| Lint | `./bin/wp lint` | Zero issues. |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Pass or record blocker evidence. |
| Public package safety (only if dependency/package surface changes) | `vp pack --dry-run` or repo-equivalent package-surface check | Tarball excludes private/generated/secret-bearing files. |

## Non-goals

- Adding a general outbound proxy.
- Changing chunking or markdown conversion behavior.
- Closing the residual DNS-rebinding TOCTOU window at the connection layer (pinning the resolved IP into the socket).
- Exposing `allowedHosts` to MCP callers (it remains a code-level/internal opt-in).
- Blocking IPs for non-fetch-index paths (e.g. `ctx_fetch_and_index`, `webfetch`).
- Reworking `fetchAndIndex` into a broader network security abstraction beyond the narrow SSRF guard.

## Cross-Plan Alignment

- No blueprint declares a direct dependency on `blueprints/planned/2026-06-14-session-fetch-index-ssrf-protection.md`.
- `blueprints/planned/2026-06-13-sandboxed-knowledge-tool-surface-parity.md` references `wp_session_fetch_and_index` test coverage in a broader parity plan, but it does not specify an incompatible API or task dependency.
- Public package safety applies only if the implementation adds a runtime dependency or changes package/release surfaces; the preferred path modifies existing source/tests only.

## Refinement Summary

| Metric                    | Value |
| ------------------------- | ----- |
| Findings total            | 8 |
| Critical                  | 0 |
| High                      | 4 (F1/F2 stale vulnerability claims now implemented; F6 DNS default confirmed; F7 remaining canonical IPv4-mapped gap) |
| Medium                    | 2 (F4 path correction; F8 special-use range hardening) |
| Low                       | 2 (F3 credential rejection; F5 distinct `blocked_host`) |
| Fixes applied             | 8/8 reflected in this blueprint |
| Cross-plans updated       | 0 (one informational reference found; no incompatible dependency) |
| Edge cases documented     | 11 |
| Risks documented          | 5 |
| **Parallelization score** | C (1 task in Wave 0, 2 tasks in Wave 1) |
| **Critical path**         | 2 waves (Task 1.1 → Task 1.2/1.3) |
| **Max parallel agents**   | 2 |
| **Total tasks**           | 3 |
| **Blueprint compliant**   | 3/3 (all tasks have lane prefixes, Status, Depends, Files, Steps (TDD), Acceptance) |

**Key refinements applied:**

- Reconciled the blueprint with current source: the first-pass SSRF implementation already exists in `ip-guard.ts`, `fetch-index.ts`, and MCP tests/tooling.
- Replaced stale create/integrate tasks with residual hardening tasks that an executor can still run safely.
- Added F7 for canonical IPv4-mapped IPv6 hostnames produced by `URL` (for example `[::ffff:7f00:1]`).
- Added F8 for broader special-use/non-global IPv4 range handling.
- Improved parallelization honestly: address policy first, then fetch-layer and MCP/lifecycle verification can proceed in parallel.
- Preserved the narrow scope: no source edits during refinement, no generated surface edits, no package-surface changes unless a future executor adds a dependency.
