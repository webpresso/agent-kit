---
type: blueprint
title: Session fetch-index SSRF protection
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: 'refined (plan-refine methodology applied; 3 fact-check findings verified, 0 cross-plan refs updated)'
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

**Goal:** Block `wp_session_fetch_and_index` from fetching internal/cloud-metadata endpoints while preserving legitimate external documentation fetching.

## Product wedge anchor

`wp_session_fetch_and_index` is the only user-facing fetch surface in session-memory. If an attacker controls the URL input (via MCP or a compromised agent), they can probe internal networks and cloud metadata services. This blueprint closes that gap at the narrowest choke point — `normalizeUrl` in `fetch-index.ts` — so every call path (MCP, internal, future surfaces) inherits the protection. The allowlist opt-in (`allowedHosts`) preserves legitimate use without weakening the default-deny posture.

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
| F1 | HIGH | `normalizeUrl` does not block private IPs. | Confirmed at `src/session-memory/fetch-index.ts:51-65`. Only protocol and credentials are rejected; no IP or hostname validation exists. |
| F2 | HIGH | Cloud metadata endpoint `169.254.169.254` is reachable. | Confirmed: `fetch` call at line 199 has no IP-range checks. Any absolute http(s) URL passes through. |
| F3 | LOW | URL credentials are stripped. | Confirmed: lines 61-63 reject `username`/`password`. No action needed. |
| F4 | MEDIUM | `FetchAndIndexOptions` lives in `types.ts`. | **Corrected:** `FetchAndIndexOptions` is in `fetch-index.ts:35-45`. `types.ts:150-155` has a different `FetchIndexOptions` for the store layer. Allowlist belongs in `fetch-index.ts` only. |
| F5 | LOW | `FetchIndexErrorCode` already includes `invalid_url`. | Confirmed at `fetch-index.ts:6-14`. The `invalid_url` code can be reused for IP/hostname rejection. |

## Tasks

#### [security] Task 1.1: Create `isInternalHost` IP/hostname guard

**Status:** todo
**Depends:** None

Create a standalone `isInternalHost(hostname: string): boolean` function in its own module so it can be unit-tested independently and reused if other fetch surfaces appear.

**Files:**
- Create: `src/session-memory/ip-guard.ts`
- Create: `src/session-memory/ip-guard.test.ts`

**Steps (TDD):**
1. Define the function contract: `isInternalHost(hostname: string): boolean`
   - Block literal IPv4 private/loopback/link-local ranges: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `0.0.0.0`
   - Block literal IPv6 loopback/link-local/unique-local: `::1`, `fe80::/10`, `fc00::/7`
   - Block common internal hostnames: `localhost`, `*.local`, `*.internal`
   - Optionally resolve hostnames via `dns.promises.lookup` and check returned addresses (latency tradeoff — consider making this opt-in via a flag)
2. Write failing test for `isInternalHost('169.254.169.254')` → `true`
3. Run: `./bin/wp test --file src/session-memory/ip-guard.test.ts` — verify FAIL
4. Implement `isInternalHost` using `URL` hostname parsing and `net.isIP()` for literal IP detection
5. Run: `./bin/wp test --file src/session-memory/ip-guard.test.ts` — verify PASS
6. Run: `./bin/wp lint src/session-memory/ip-guard.ts src/session-memory/ip-guard.test.ts` and `./bin/wp typecheck`

**Acceptance:**
- [ ] `isInternalHost('169.254.169.254')` returns `true` (link-local / cloud metadata)
- [ ] `isInternalHost('127.0.0.1')`, `isInternalHost('::1')`, `isInternalHost('localhost')` return `true`
- [ ] `isInternalHost('10.0.0.1')`, `isInternalHost('192.168.1.1')`, `isInternalHost('172.16.0.1')` return `true`
- [ ] `isInternalHost('example.com')`, `isInternalHost('8.8.8.8')` return `false`
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass on changed files

---

#### [session-memory] Task 1.2: Integrate guard into `normalizeUrl` + add allowlist option

**Status:** todo
**Depends:** Task 1.1

Wire `isInternalHost` into the `normalizeUrl` function and add an `allowedHosts` bypass to `FetchAndIndexOptions` for controlled internal-fetch scenarios.

**Files:**
- Modify: `src/session-memory/fetch-index.ts`
- Modify: `src/session-memory/fetch-index.test.ts`

**Steps (TDD):**
1. Add `allowedHosts?: string[]` to `FetchAndIndexOptions` interface (line 35)
2. Write failing test: `fetchAndIndex({ url: 'http://169.254.169.254/latest/meta-data/', ... })` rejects with code `invalid_url`
3. Run: `./bin/wp test --file src/session-memory/fetch-index.test.ts` — verify FAIL
4. Import `isInternalHost` from `./ip-guard.js` and call it inside `normalizeUrl` after the credential check (after line 63). Throw `FetchIndexError('invalid_url', ...)` when host is blocked AND not in `allowedHosts`
5. Pass `allowedHosts` down to `normalizeUrl` (update its signature or pass via context). Update `fetchAndIndex` to thread `options.allowedHosts`
6. Run: `./bin/wp test --file src/session-memory/fetch-index.test.ts` — verify PASS
7. Add test for allowlist bypass: URL is in `allowedHosts` → fetch proceeds normally
8. Run: `./bin/wp test --file src/session-memory/fetch-index.test.ts` — verify PASS
9. Run: `./bin/wp lint src/session-memory/fetch-index.ts src/session-memory/fetch-index.test.ts` and `./bin/wp typecheck`

**Acceptance:**
- [ ] `http://169.254.169.254/latest/meta-data/` is rejected with `FetchIndexError` code `invalid_url`
- [ ] `http://127.0.0.1/`, `http://localhost/`, `http://192.168.1.1/` are rejected
- [ ] `https://example.com/docs` remains allowed
- [ ] Passing `allowedHosts: ['localhost']` bypasses the block for `http://localhost/path`
- [ ] Default behavior (no `allowedHosts`) remains deny for internal hosts
- [ ] Existing tests still pass (no regression on valid URLs, credential rejection, body limits, etc.)

---

#### [integration] Task 1.3: Add MCP tool integration coverage for blocked/allowed URLs

**Status:** todo
**Depends:** Task 1.1, Task 1.2

Exercise `wp_session_fetch_and_index` end-to-end with blocked internal URLs and allowed external URLs. The MCP tool wraps `fetchAndIndex`, so blocked URLs must surface as errors, not silent failures.

**Files:**
- Modify: `src/mcp/tools/session-fetch-and-index.test.ts`

**Steps (TDD):**
1. Write failing integration test: call `handleSessionFetchAndIndex` with `url: 'http://169.254.169.254/latest/meta-data/'` — expect `isError: true` and warning mentioning blocked/internal URL
2. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` — verify FAIL
3. Verify the MCP tool already delegates to `fetchAndIndex` (no code changes needed — the wire-up at `session-fetch-and-index.ts:155` flows through `normalizeUrl`). If the tool needs to surface `invalid_url` with a better warning message for internal-host rejections, update `warningFor()` in the tool
4. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` — verify PASS
5. Add test: valid external URL (e.g. `https://example.com`) still works end-to-end through the tool
6. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts` — verify PASS
7. Run: `./bin/wp lint src/mcp/tools/session-fetch-and-index.test.ts` and `./bin/wp typecheck`

**Acceptance:**
- [ ] `http://169.254.169.254/latest/meta-data/` through MCP tool returns `isError: true` with appropriate warning
- [ ] `http://127.0.0.1/`, `http://localhost/`, `http://192.168.1.1/` through MCP tool return `isError: true`
- [ ] `https://example.com/docs` through MCP tool succeeds (indexes content, returns chunks)
- [ ] Existing MCP tool tests still pass (HTML indexing, JSON indexing, timeout, abort, invalid URL, empty content)
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass

---

## Edge Cases

| ID | Case | Handling | Severity |
| -- | ---- | -------- | -------- |
| E1 | DNS rebinding: hostname resolves to public IP at check time, private IP at fetch time | Risk accepted — mitigated by resolving at request time inside `isInternalHost` (if DNS lookup is enabled). Documented in Risks. | MEDIUM |
| E2 | IPv6-mapped IPv4 addresses (`::ffff:127.0.0.1`) | Must be treated as internal; `isInternalHost` should normalize or check both representations. | MEDIUM |
| E3 | Hostname with trailing dot (`localhost.`) | URL parser normalizes trailing dots; verify `isInternalHost` handles this. | LOW |
| E4 | IDN/punycode hostnames (`xn--e1afmkfd.xn--p1ai`) | `URL.hostname` returns punycode; check against punycode equivalents of internal hosts. | LOW |
| E5 | `0.0.0.0` as hostname | Should be blocked (non-routable meta-address). | LOW |
| E6 | Allowlist bypass with wildcards | Explicit hostnames only in `allowedHosts`; no glob/wildcard matching to avoid accidental bypass. | MEDIUM |
| E7 | `wp_session_fetch_and_index` does not expose `allowedHosts` to callers | By design — `allowedHosts` is a code-level opt-in for internal callers. MCP callers cannot self-allowlist. | LOW |

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| DNS rebinding bypasses static IP checks | Resolve hostname at request time inside `isInternalHost` and validate returned address. If DNS resolution is disabled for latency, document the residual risk. |
| Legitimate local docs fetch blocked | Provide `allowedHosts` option in `FetchAndIndexOptions` for operator-controlled bypass. |
| IPv6-mapped IPv4 evasion | Verify in `ip-guard.test.ts` that `::ffff:127.0.0.1` returns `true`. |

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
- Blocking DNS rebinding at the HTTP layer beyond IP checks.
- Exposing `allowedHosts` to MCP callers (it remains a code-level/internal opt-in).
- Blocking IPs for non-fetch-index paths (e.g., `ctx_fetch_and_index`, `webfetch`).

## Refinement Summary

| Metric                    | Value                                            |
| ------------------------- | ------------------------------------------------ |
| Findings total            | 5                                                |
| Critical                  | 0                                                |
| High                      | 2 (F1, F2 — confirmed vulnerabilities)           |
| Medium                    | 2 (F4, E2/E6 — path corrections + edge cases)    |
| Low                       | 1 (F5 — confirmed, no action)                    |
| Fixes applied             | 5/5                                              |
| Cross-plans updated       | 0 (no blueprints reference this one)             |
| Edge cases documented     | 7                                                |
| Risks documented          | 3                                                |
| **Parallelization score** | D — CPR 1.0, 3 sequential waves                  |
| **Critical path**         | 3 waves (Task 1.1 → 1.2 → 1.3)                   |
| **Max parallel agents**   | 1 (all tasks serial due to tight coupling)       |
| **Total tasks**           | 3                                                |
| **Blueprint compliant**   | 3/3 (all tasks have Depends, Files, Steps TDD, Acceptance) |

**Key refinements applied:**
- **F4**: Corrected `FetchAndIndexOptions` location from `types.ts` to `fetch-index.ts:35-45`. Task 1.2 no longer references `types.ts`.
- **Task 1.1 restructured**: Extracted `isInternalHost` into standalone `ip-guard.ts` module to eliminate file conflict with Task 1.2 (both would have modified `fetch-index.ts`). This enables independent unit testing of the IP/hostname logic.
- **6 edge cases documented**: DNS rebinding, IPv6-mapped IPv4, trailing dots, punycode, `0.0.0.0`, allowlist wildcard exclusion — all in the Edge Cases table.
- **Non-goals clarified**: Added explicit non-goals for `ctx_fetch_and_index`/`webfetch` scope and MCP-level allowlist exposure.
- **Blueprint format**: All tasks now have `**Depends:**`, `**Files:**` with Create/Modify slots, `**Steps (TDD):**` with explicit `./bin/wp` commands, and `**Acceptance:**` checkboxes.
