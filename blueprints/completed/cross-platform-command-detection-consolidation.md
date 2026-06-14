---
type: blueprint
title: Cross-platform command detection consolidation
status: completed
complexity: M
owner: agent-kit
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '100% (3/3 tasks done, 0 blocked, updated 2026-06-14)'
tags:
  - historical
  - setup
  - windows
  - command-detection
completed_at: '2026-06-14'
---

# Cross-platform command detection consolidation

## Product wedge anchor

- **Stage outcome:** Setup command detection works cross-platform and the duplicate PATH enumeration has one owner.
- **Consuming surface:** wp setup/init presets, commandExists runtime helper, and init integration tests.
- **New user-visible capability:** Windows and POSIX users get reliable detection of installed agent CLIs without depending on Unix which.

## Summary

Historical record for PR #136, merged to main as squash commit 9b8c8086 on 2026-06-14. The work shipped a shared cross-platform commandExists helper, replaced five spawnSync('which') detection copies, adjusted init integration tests to stage executable fake bins on PATH, and refactored resolveBinOnPath to share the same PATH/PATHEXT candidate enumeration while preserving its weaker exists predicate. Historical verification gap waiver: this blueprint was created after merge, so task status is based on real PR evidence rather than contemporaneous blueprint task transitions. Evidence: PR #136 was MERGED; branch commits included 02edaee9, 815f725e, and 844739d1; src/runtime/command-exists.test.ts covered POSIX and win32/PATHEXT behavior; PR checks were reported 10/10 green; local source audit guardrails and targeted tests passed before merge.

#### Task 1.1: Replace command detection copies with commandExists

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","allow_manual":true,"description":"Historical PR evidence confirms the shared cross-platform commandExists helper landed in PR #136.","kind":"manual","log_excerpt":"PR #136 merged as squash commit 9b8c8086 on main. The merged tree includes src/runtime/command-exists.ts and src/runtime/command-exists.test.ts; the PR checks were reported 10/10 passing before merge.","result":"pass","ts":"2026-06-14T21:29:50.000Z"}]
```

**Wave:** historical
**Lane:** backend

Historical task completed in PR #136. A shared runtime commandExists helper replaced duplicated spawnSync('which')-based helpers so detection works on Windows and POSIX without assuming the Unix which command exists.

**Verification:** PR #136 merged as 9b8c8086 on main; src/runtime/command-exists.ts and src/runtime/command-exists.test.ts are present in that merge; PR #136 reported 10/10 GitHub checks passing before merge.

**Acceptance:**
- [x] src/runtime/command-exists.ts existed in the merged PR.
- [x] Five command-detection call sites used the shared helper after the PR.
- [x] src/runtime/command-exists.test.ts covered POSIX and win32/PATHEXT behavior.
#### Task 1.2: Make init integration detection tests use real PATH boundary

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","allow_manual":true,"description":"Historical PR evidence confirms init integration tests moved command detection to the real PATH boundary.","kind":"manual","log_excerpt":"Branch commit 815f725e was included in PR #136 before squash. The work staged real executable fake bins for detection, resolved the codex red herring as cumulative scaffolder work, and the PR checks were reported 10/10 passing before merge.","result":"pass","ts":"2026-06-14T21:29:50.000Z"}]
```

**Wave:** historical
**Lane:** qa

Historical task completed in PR #136. Init integration tests stopped depending on the child_process spawnSync('which') mock and instead staged real executable fake bins on PATH, matching the production detection boundary while avoiding detection of codex when no assertion required it.

**Verification:** Branch commit 815f725e was included in PR #136 before squash; init preset integration evidence showed the isolated test passed with staged fake bins and PR #136 reported 10/10 GitHub checks passing before merge.

**Acceptance:**
- [x] Init preset integration tests staged a real fake claude bin for detection.
- [x] The codex detection red herring was resolved as cumulative scaffolder filesystem work, not a command detection hang.
- [x] PR #136 CI completed green after the test fix.
#### Task 1.3: Deduplicate PATH/PATHEXT enumeration

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","allow_manual":true,"description":"Historical PR evidence confirms PATH/PATHEXT enumeration was deduplicated while preserving resolveBinOnPath's exists predicate.","kind":"manual","log_excerpt":"Branch commit 844739d1 was included in PR #136 before squash. The work delegated resolveBinOnPath enumeration to pathCandidates, kept the exists predicate for npm shims, passed targeted package-root/doctor/command-exists tests, and PR checks were reported 10/10 passing at head 844739d1 before squash.","result":"pass","ts":"2026-06-14T21:29:50.000Z"}]
```

**Wave:** historical
**Lane:** backend

Historical task completed in commit 844739d1 before PR #136 was squashed. resolveBinOnPath delegates candidate enumeration to pathCandidates while retaining its distinct exists predicate for npm shims that may not have an executable bit.

**Verification:** Branch commit 844739d1 was included in PR #136 before squash; targeted package-root, doctor, and command-exists tests passed locally before merge; source audit guardrails passed before merge; PR #136 reported 10/10 GitHub checks passing at head 844739d1 before squash.

**Acceptance:**
- [x] resolveBinOnPath shared pathCandidates for cross-platform PATH/PATHEXT order.
- [x] The doctor/package-root resolver retained the exists predicate instead of commandExists's runnable predicate.
- [x] Targeted package-root, doctor, and command-exists tests passed before merge.
