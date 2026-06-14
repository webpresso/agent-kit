---
type: blueprint
title: Session fetch-index SSRF protection
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: 'refined (plan-refine methodology applied; 5 fact-check findings verified, 1 architecture fix applied, 0 cross-plan refs updated)'
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

**Goal:** Block `wp_session_fetch_and_index` from fetching internal/cloud-metadata endpoints — including hostnames that resolve to private IPs at fetch time — while preserving legitimate external documentation fetching.

## Product wedge anchor

- **Stage outcome:** Hardens the session-memory MCP surface (the `wp_*` dev-workflow lane shipped to Tier 1 Claude Code / Codex consumers) against SSRF — a precondition for trusting `wp_session_fetch_and_index` with attacker-influenced URLs in shared/CI contexts.
- **Consuming surface:** The `wp_session_fetch_and_index` MCP tool (`src/mcp/tools/session-fetch-and-index.ts`), which threads every call through `normalizeUrl` in `src/session-memory/fetch-index.ts`.
- **New user-visible capability:** A consumer can call `wp_session_fetch_and_index` on an untrusted URL and have internal/cloud-metadata targets (literal IPs **and** hostnames that resolve to private addresses) rejected by default, instead of silently probing the internal network.

`wp_session_fetch_and_index` is the only user-facing fetch surface in session-memory. If an attacker controls the URL input (via MCP or a compromised agent), they can probe internal networks and cloud metadata services. This blueprint closes that gap at the narrowest choke point — `normalizeUrl` in `fetch-index.ts` — so every call path (MCP, internal, future surfaces) inherits the protection. Because static literal-IP blocking is trivially bypassed by a hostname that resolves to a private IP (e.g. an attacker-controlled domain or a `*.nip.io`-style host pointing at `169.254.169.254`), DNS resolution at request time is part of the **default** guard, not an opt-in. The allowlist opt-in (`allowedHosts`) preserves legitimate use without weakening the default-deny posture.

## Quick Reference (Execution Waves)

| Wave     | Tasks        | Dependencies          | Parallelizable | Effort (T-shirt) |
| -------- | ------------ | --------------------- | -------------- | ---------------- |
| Wave 0   | 1.1          | None                  | 1 agent        | S                |
| Wave 1   | 1.2          | Task 1.1              | 1 agent        | S                |
| Wave 2   | 1.3          | Task 1.1, Task 1.2    | 1 agent        | S                |
| **Critical path** | 1.1 → 1.2 → 1.3 | —               | 3 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual | Notes                                        |
| ------ | ---------------------------------- | -------------------- | ------ | --------------------------------------------- |
| RW0    | Ready tasks in Wave 0              | ≥ 3                  | 1      | Inherent—3 tightly-coupled sequential changes |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 1.0    | Sequential by design (ip-guard → integrate → verify) |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 1.0    | 3 edges / 3 tasks                             |
| CP     | same-file overlaps per wave        | 0                    | 0      | No parallel file conflicts                    |

**Parallelization score: D** (CPR 1.0, narrow waves). Justified: the three tasks are tightly coupled — each builds on the prior — and the total work is <1 hour. Splitting further would create artificial subtasks with no independent testing value.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | `normalizeUrl` does not block private IPs. | Confirmed at `src/session-memory/fetch-index.ts:51-66`. Only protocol and credentials are rejected; no IP or hostname validation exists. |
| F2 | HIGH | Cloud metadata endpoint `169.254.169.254` is reachable. | Confirmed: `fetch` call at line 199 has no IP-range checks. Any absolute http(s) URL passes through. |
| F3 | LOW | URL credentials are stripped. | Confirmed: lines 61-63 reject `username`/`password`. No action needed. |
| F4 | MEDIUM | `FetchAndIndexOptions` lives in `types.ts`. | **Corrected:** `FetchAndIndexOptions` is in `fetch-index.ts:35-45`. `types.ts:150-155` has a different `FetchIndexOptions` for the store layer. Allowlist belongs in `fetch-index.ts` only. |
| F5 | LOW | `FetchIndexErrorCode` already includes `invalid_url`. | Confirmed at `fetch-index.ts:6-14`. The `invalid_url` code is reused for IP/hostname rejection; a distinct `blocked_host` code is added so the warning surfaced by the MCP tool is meaningful (see Task 1.3). |
| F6 | HIGH | Static literal-IP blocking is sufficient SSRF protection. | **Corrected:** literal-IP-only checks are trivially bypassed because an attacker controls the URL and can use a hostname that resolves to a private IP. DNS resolution at request time is therefore part of the default guard (Task 1.1), not an opt-in. |

## Tasks

#### [security] Task 1.1: Create `isInternalHost` IP/hostname guard (with default DNS resolution)

**Status:** todo
**Depends:** None

Create a standalone `isInternalHost(hostname: string): Promise<boolean>` function in its own module. The module is split out solely to avoid the same-file conflict with Task 1.2 (both would otherwise modify `fetch-index.ts`) and to allow independent unit testing of the IP/hostname logic.

**Files:**
- Create: `src/session-memory/ip-guard.ts`
- Create: `src/session-memory/ip-guard.test.ts`

**Steps (TDD):**
1. Define the function contract: `isInternalHost(hostname: string): Promise<boolean>` (async — DNS resolution is part of the default path, see step 5).
   - Strip surrounding IPv6 brackets from the hostname (`URL.hostname` returns `[::1]` with brackets) **before** calling `net.isIP()` or any range check.
   - Block literal IPv4 private/loopback/link-local ranges: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0`
   - Block literal IPv6 loopback/link-local/unique-local: `::1`, `fe80::/10`, `fc00::/7`, and IPv6-mapped IPv4 (`::ffff:127.0.0.1`)
   - Block common internal hostnames: `localhost`, `*.local`, `*.internal`
2. Write failing test for `isInternalHost('169.254.169.254')` → resolves `true`
3. Run: `./bin/wp test --file src/session-memory/ip-guard.test.ts` — verify FAIL
4. Implement the literal-IP/hostname checks using `URL` hostname parsing and `net.isIP()` for literal IP detection.
5. **Default DNS resolution:** for non-literal hostnames, resolve via `dns.promises.lookup(hostname, { all: true })` and check **every** returned address against the private ranges above. Bound the lookup with the same `AbortController`/timeout the fetch path already uses; on lookup failure, fail closed (treat as blocked) and surface a warning. This closes the dominant hostname-based SSRF vector (F6) — it is not optional.
6. Run: `./bin/wp test --file src/session-memory/ip-guard.test.ts` — verify PASS
7. Run: `./bin/wp lint src/session-memory/ip-guard.ts src/session-memory/ip-guard.test.ts` and `./bin/wp typecheck`

**Acceptance:**
- [ ] `isInternalHost('169.254.169.254')` resolves `true` (link-local / cloud metadata)
- [ ] `isInternalHost('127.0.0.1')`, `isInternalHost('::1')`, `isInternalHost('[::1]')`, `isInternalHost('localhost')` resolve `true`
- [ ] `isInternalHost('10.0.0.1')`, `isInternalHost('192.168.1.1')`, `isInternalHost('172.16.0.1')` resolve `true`
- [ ] `isInternalHost('::ffff:127.0.0.1')` resolves `true` (IPv6-mapped IPv4)
- [ ] A hostname that resolves (via DNS) to a private/link-local address resolves `true` (mock `dns.promises.lookup`)
- [ ] `isInternalHost('example.com')`, `isInternalHost('8.8.8.8')` resolve `false`
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass on changed files

---

#### [session-memory] Task 1.2: Integrate guard into `normalizeUrl` + add allowlist option

**Status:** todo
**Depends:** Task 1.1

Wire `isInternalHost` into the URL-validation path and add an `allowedHosts` bypass to `FetchAndIndexOptions` for controlled internal-fetch scenarios. Because `isInternalHost` is now async (Task 1.1, default DNS resolution), the host check runs at the `fetchAndIndex` boundary (where async work is already happening) rather than inside a synchronous `normalizeUrl`.

**Files:**
- Modify: `src/session-memory/fetch-index.ts`
- Modify: `src/session-memory/fetch-index.test.ts`

**Steps (TDD):**
1. Add `allowedHosts?: string[]` to `FetchAndIndexOptions` interface (lines 35-45)
2. Add a `blocked_host` member to `FetchIndexErrorCode` (lines 6-14) so blocked internal URLs are distinguishable from malformed-URL (`invalid_url`) cases
3. Write failing test: `fetchAndIndex({ url: 'http://169.254.169.254/latest/meta-data/', ... })` rejects with code `blocked_host`
4. Run: `./bin/wp test --file src/session-memory/fetch-index.test.ts` — verify FAIL
5. Import `isInternalHost` from `./ip-guard.js` and `await` it after `normalizeUrl` returns (after the credential check at line 63). Throw `FetchIndexError('blocked_host', ...)` when the host is blocked AND not in `allowedHosts`
6. Thread `options.allowedHosts` from `fetchAndIndex` down to the host-check call
7. Run: `./bin/wp test --file src/session-memory/fetch-index.test.ts` — verify PASS
8. Add test for allowlist bypass: URL host is in `allowedHosts` → fetch proceeds normally
9. Run: `./bin/wp test --file src/session-memory/fetch-index.test.ts` — verify PASS
10. Run: `./bin/wp lint src/session-memory/fetch-index.ts src/session-memory/fetch-index.test.ts` and `./bin/wp typecheck`

**Acceptance:**
- [ ] `http://169.254.169.254/latest/meta-data/` is rejected with `FetchIndexError` code `blocked_host`
- [ ] `http://127.0.0.1/`, `http://localhost/`, `http://192.168.1.1/` are rejected with `blocked_host`
- [ ] A hostname resolving to a private IP is rejected with `blocked_host`
- [ ] `https://example.com/docs` remains allowed
- [ ] Passing `allowedHosts: ['localhost']` bypasses the block for `http://localhost/path`
- [ ] Default behavior (no `allowedHosts`) remains deny for internal hosts
- [ ] Existing tests still pass (no regression on valid URLs, credential rejection, body limits, etc.)

---

#### [integration] Task 1.3: Add MCP tool integration coverage for blocked/allowed URLs

**Status:** todo
**Depends:** Task 1.1, Task 1.2

Exercise `wp_session_fetch_and_index` end-to-end with blocked internal URLs and allowed external URLs. The MCP tool wraps `fetchAndIndex`, so blocked URLs must surface as errors with a meaningful warning, not silent failures.

**Files:**
- Modify: `src/mcp/tools/session-fetch-and-index.test.ts`
- Modify: `src/mcp/tools/session-fetch-and-index.ts` (warning branch only)

**Steps (TDD):**
1. Write failing integration test: call `handleSessionFetchAndIndex` with `url: 'http://169.254.169.254/latest/meta-data/'` — expect `isError: true` and a warning mentioning the blocked/internal host
2. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` — verify FAIL
3. The MCP tool already delegates to `fetchAndIndex` (wire-up at `session-fetch-and-index.ts:155`), so the `blocked_host` rejection flows through. Add a `blocked_host` branch to `warningFor()` in the tool so the surfaced warning text names the internal-host rejection (rather than the generic `invalid_url`/"must be absolute http(s)" message). This is the minimal code change required to make the acceptance warning meaningful.
4. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` — verify PASS
5. Add test: valid external URL (e.g. `https://example.com`) still works end-to-end through the tool
6. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` — verify PASS
7. Run: `./bin/wp lint src/mcp/tools/session-fetch-and-index.ts src/mcp/tools/session-fetch-and-index.test.ts` and `./bin/wp typecheck`

**Acceptance:**
- [ ] `http://169.254.169.254/latest/meta-data/` through MCP tool returns `isError: true` with a warning naming the blocked/internal host (`blocked_host` branch in `warningFor()`)
- [ ] `http://127.0.0.1/`, `http://localhost/`, `http://192.168.1.1/` through MCP tool return `isError: true`
- [ ] `https://example.com/docs` through MCP tool succeeds (indexes content, returns chunks)
- [ ] Existing MCP tool tests still pass (HTML indexing, JSON indexing, timeout, abort, invalid URL, empty content)
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass

---

## Edge Cases

| ID | Case | Handling | Severity |
| -- | ---- | -------- | -------- |
| E1 | DNS rebinding: hostname resolves to public IP at check time, private IP at fetch time | Mitigated by resolving at request time inside `isInternalHost` (DNS resolution is now default, not opt-in). Residual TOCTOU window between lookup and fetch documented in Risks. | MEDIUM |
| E2 | IPv6-mapped IPv4 addresses (`::ffff:127.0.0.1`) | Must be treated as internal; `isInternalHost` normalizes or checks both representations. | MEDIUM |
| E3 | Hostname with trailing dot (`localhost.`) | URL parser normalizes trailing dots; verify `isInternalHost` handles this. | LOW |
| E4 | IDN/punycode hostnames (`xn--e1afmkfd.xn--p1ai`) | `URL.hostname` returns punycode; check against punycode equivalents of internal hosts. DNS resolution covers the post-resolution IP regardless. | LOW |
| E5 | `0.0.0.0` as hostname | Should be blocked (non-routable meta-address). | LOW |
| E6 | Bracketed IPv6 host (`[::1]`) | `URL.hostname` returns brackets; strip them before `net.isIP()`/range checks (Task 1.1 step 1). | MEDIUM |
| E7 | Allowlist bypass with wildcards | Explicit hostnames only in `allowedHosts`; no glob/wildcard matching to avoid accidental bypass. | MEDIUM |
| E8 | `wp_session_fetch_and_index` does not expose `allowedHosts` to callers | By design — `allowedHosts` is a code-level opt-in for internal callers. MCP callers cannot self-allowlist. | LOW |

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| DNS rebinding bypasses the check via a TOCTOU window | DNS resolution is now default inside `isInternalHost` (resolves and validates every returned address at request time). The residual window is the gap between the lookup and the subsequent `fetch`; closing it fully (e.g. pinning the resolved IP into the connection) is out of scope and documented in Non-goals. |
| DNS lookup latency on the fetch path | The lookup is bounded by the existing `AbortController`/timeout; on failure it fails closed (treats the host as blocked) rather than raising the timeout. |
| Legitimate local docs fetch blocked | Provide `allowedHosts` option in `FetchAndIndexOptions` for operator-controlled bypass. |
| IPv6-mapped IPv4 / bracketed IPv6 evasion | Verify in `ip-guard.test.ts` that `::ffff:127.0.0.1`, `::1`, and `[::1]` all resolve `true`. |

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit tests (ip-guard) | `./bin/wp test --file src/session-memory/ip-guard.test.ts` | Pass. |
| Unit tests (fetch-index) | `./bin/wp test --file src/session-memory/fetch-index.test.ts` | Pass (new + existing). |
| MCP integration | `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` | Pass (new + existing). |
| Full suite | `./bin/wp test` | All tests pass, no regressions. |
| Lint | `./bin/wp lint` | Zero issues. |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Pass. |

## Non-goals

- Adding a general outbound proxy.
- Changing chunking or markdown conversion behavior.
- Closing the residual DNS-rebinding TOCTOU window at the connection layer (pinning the resolved IP into the socket) — only request-time resolution is in scope.
- Exposing `allowedHosts` to MCP callers (it remains a code-level/internal opt-in).
- Blocking IPs for non-fetch-index paths (e.g., `ctx_fetch_and_index`, `webfetch`).

## Refinement Summary

| Metric                    | Value                                            |
| ------------------------- | ------------------------------------------------ |
| Findings total            | 6                                                |
| Critical                  | 0                                                |
| High                      | 3 (F1, F2 — confirmed vulnerabilities; F6 — static-IP-only insufficiency) |
| Medium                    | 1 (F4 — path correction)                         |
| Low                       | 2 (F3, F5 — confirmed; F5 adds `blocked_host` code) |
| Fixes applied             | 6/6                                              |
| Cross-plans updated       | 0 (no blueprints reference this one)             |
| Edge cases documented     | 8                                                |
| Risks documented          | 4                                                |
| **Parallelization score** | D — CPR 1.0, 3 sequential waves                  |
| **Critical path**         | 3 waves (Task 1.1 → 1.2 → 1.3)                   |
| **Max parallel agents**   | 1 (all tasks serial due to tight coupling)       |
| **Total tasks**           | 3                                                |
| **Blueprint compliant**   | 3/3 (all tasks have Depends, Files, Steps TDD, Acceptance) |

**Key refinements applied:**
- **F6 (HIGH) — DNS resolution made default**: `isInternalHost` is now `async` and resolves hostnames via `dns.promises.lookup({ all: true })`, checking every returned address against the private ranges. The previous "opt-in / optional flag / latency tradeoff" language is removed — static literal-IP blocking alone left the dominant hostname-based SSRF vector open, so the goal statement no longer overclaims.
- **Task 1.3 contradiction resolved**: added a distinct `blocked_host` `FetchIndexErrorCode` and a matching `warningFor()` branch so blocked internal URLs surface a meaningful warning, instead of reusing the generic `invalid_url`/"must be absolute http(s)" text.
- **IPv6 bracket stripping**: Task 1.1 now strips surrounding `[` `]` from `URL.hostname` before `net.isIP()`/range checks, with an `[::1]` acceptance row (E6).
- **YAGNI**: struck the speculative "reused if other fetch surfaces appear" justification from Task 1.1; the module split is justified solely by the same-file-conflict avoidance with Task 1.2.
- **F1 citation corrected**: `fetch-index.ts:51-65` → `51-66` (cosmetic).
- **F4**: `FetchAndIndexOptions` location corrected from `types.ts` to `fetch-index.ts:35-45`. Task 1.2 no longer references `types.ts`.
- **Task 1.1 module split**: `isInternalHost` extracted into standalone `ip-guard.ts` to eliminate the same-file conflict with Task 1.2 (both would otherwise modify `fetch-index.ts`).
- **Edge cases documented**: DNS rebinding, IPv6-mapped IPv4, trailing dots, punycode, `0.0.0.0`, bracketed IPv6, allowlist wildcard exclusion, MCP allowlist non-exposure.
- **Non-goals clarified**: residual DNS-rebinding TOCTOU window, `ctx_fetch_and_index`/`webfetch` scope, MCP-level allowlist exposure.
- **Blueprint format**: all tasks have `**Status:**`/`**Depends:**` on their own lines, `**Files:**` with Create/Modify slots, `**Steps (TDD):**` with explicit `./bin/wp` commands, and `**Acceptance:**` checkboxes.
