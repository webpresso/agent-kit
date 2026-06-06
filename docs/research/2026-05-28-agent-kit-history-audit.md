---
type: research
last_updated: '2026-05-28'
---

# Agent Kit bounded historical audit for public GitHub visibility / first public npm release

Date: 2026-05-28
Repo: `/Users/ozby/repos/webpresso/agent-kit`
Scope: reachable git history only (`--all`), bounded to secret-removal signals plus known local/internal residue classes

## Verdict

**Classification: `clean-public-snapshot-preferred`**

- **Not `rewrite-required`**: this audit did **not** find evidence of live or insufficiently mitigated credentials, private keys, or must-remove legal/PII targets in reachable history.
- **Not `forward-only-acceptable`** for a public repo cutover: reachable history still contains repeated maintainer-local paths, session telemetry dumps, plugin/tool inventories, and private-registry workflow residue across many commits.
- **Recommended strategy**: keep legacy/internal history private, publish from a clean public snapshot/new public root after current-tree and package-surface gates pass, and reserve full history rewrite for a later audit that finds truly sensitive material.

## Official GitHub guidance used

- GitHub Docs — [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
  - rotate/revoke secrets first
  - history rewrite has significant side effects
  - GitHub Support will not remove non-sensitive data
- GitHub Docs — [Setting repository visibility](https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
  - once the repo is made public, the code is visible to everyone and Actions history/logs become visible
- GitHub Docs — [About repositories](https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories)
  - repositories expose file revision history, not only the current tree

## Commands executed

```bash
cd /Users/ozby/repos/webpresso/agent-kit
git status --short
git rev-parse HEAD
gitleaks git . --log-opts='--all' --report-format json --report-path .omx/tmp/gitleaks-history-20260528.json --redact
git log -P --all --name-only --format='COMMIT %H %cs %s' -G 'gh[pousr]_[A-Za-z0-9]{20,}' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G '/Users/ozby' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G '~/.claude' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G 'session_id' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G 'mcp__plugin_' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G 'GH_PACKAGES_TOKEN' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G 'ozby/context-mode' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G 'BEGIN [A-Z ]*PRIVATE KEY' --
git log -P --all --name-only --format='COMMIT %H %cs %s' -G 'npm_[A-Za-z0-9]{20,}' --
git ls-files '.test-plan-service/**'
git log --all --format='COMMIT %H %cs %s' --name-only -- .test-plan-service
git show bae773b779df7197eec940b21d4234dfb105651c:scripts/bench/__fixtures__/claude-stream-say-hi.jsonl | sed -n '1,36p'
git show e038e3a8cdacd68d3898496c18daa8b746d83233:src/audit/package-surface.test.ts | sed -n '168,204p'
git show 143e39237c34ddb97c83b7bb15014b328403613e:src/mcp/tools/ci-act.test.ts | sed -n '1,40p'
```

## Findings

### A. Rewrite-trigger search: **no confirmed sensitive-history trigger**

#### 1) `gitleaks` history scan

- `gitleaks` scanned **741 commits** / about **161.95 MB** and reported **18** findings.
- All 18 reviewed hits were **false positives or test/sample data**, not live secrets:
  - `bae773b779df7197eec940b21d4234dfb105651c`
    - `scripts/bench/lib/manifest.ts`
    - `scripts/bench/lib/manifest.test.ts`
    - `src/cli/commands/bench/session-memory.test.ts`
    - findings came from env-var names and one-character test literals around `ANTHROPIC_API_KEY*`
  - `e038e3a8cdacd68d3898496c18daa8b746d83233`
  - `528d7bf044cc79e70d8620cc19be2f4c04048c34`
  - `143e39237c34ddb97c83b7bb15014b328403613e`
    - placeholder `ghp_123456...` values in tests intended to prove redaction/audit behavior
  - `e83f6d51797e854b7eb5f619a223abfb38df8bac`
    - sample README secrets in a test package (`test-client-id`, `test-secret`, etc.)

#### 2) Targeted secret-pattern probes

- `git log -P --all -G 'BEGIN [A-Z ]*PRIVATE KEY' --` → **no matching commits**
- `git log -P --all -G 'npm_[A-Za-z0-9]{20,}' --` → **no matching commits**
- no audit evidence in this lane showed real AWS-style keys, real npm tokens, or private-key material

**Conclusion:** the bounded audit did **not** uncover evidence that forces a history rewrite on security-removal grounds.

### B. Non-sensitive but unwanted history residue: **substantial and repeated**

These hits are not rewrite triggers by themselves, but they do make public full-history exposure undesirable.

#### 1) Maintainer-local paths and machine-specific traces

- `/Users/ozby` appears in **31 matching commits**
  - sample files:
    - `docs/worktrees.md`
    - `docs/research/2026-05-13-hook-coordination-fact-check.md`
    - `docs/research/2026-05-13-context-mode-alternatives-and-rust-rewrite.md`
    - `docs/hook-matrix.md`
    - `src/hooks/pretool-guard/dev-routing.test.ts`
    - `src/hooks/doctor.test.ts`
- `~/.claude` appears in **89 matching commits**
  - concentrated in tracked generated output plus docs:
    - `dist/esm/cli/commands/init/scaffolders/gstack/index.js`
    - `dist/esm/cli/commands/init/scaffolders/codex-mcp/index.js`
    - `README.md`
    - `docs/presets.md`

#### 2) Real session telemetry / internal tool metadata

- `session_id` appears in **57 matching commits**
- `mcp__plugin_` appears in **49 matching commits**
- strongest concrete example:
  - `bae773b779df7197eec940b21d4234dfb105651c:scripts/bench/__fixtures__/claude-stream-say-hi.jsonl`
  - contains real-looking session UUIDs, hook execution telemetry, plugin/tool routing details, and maintainer-environment context
- additional spread:
  - `src/session-memory/session.ts`
  - `src/session-memory/store.ts`
  - `docs/guides/session-memory.md`
  - older tracked `dist/esm/**` outputs

#### 3) Private-registry / private-workflow residue

- `GH_PACKAGES_TOKEN` appears in **87 matching commits**
  - sample files:
    - `.github/workflows/ci.yml`
    - `.github/workflows/release.yml`
    - `.github/workflows/bundle-smoke.yml`
    - `.npmrc`
    - `docs/getting-started.md`
    - `catalog/agent/rules/changeset-release.md`
- `ozby/context-mode` appears in **6 matching commits**
  - sample files:
    - `docs/research/2026-05-13-hook-coordination-fact-check.md`
    - `blueprints/draft/rtk-inside-ctx-execute-recover-shell-filtering-in-sandboxed-commands/_overview.md`

#### 4) Removed generated artifact still exists historically

- `git ls-files '.test-plan-service/**'` now returns **0**
- but history shows one tracked-artifact commit:
  - `35428d3c2d5584209eb61e6a7f74e99250094362`
  - files under `.test-plan-service/**`
  - sample content is generated blueprint fixture material, not a secret, but it reinforces that legacy history is noisy

## Classification rationale

### Why this is **not** `rewrite-required`

**Evidence**
- no private-key hits
- no npm-token hits
- `gitleaks` findings reviewed to false-positive/test-fixture status

**Inference**
- the available historical evidence does not clear the threshold GitHub describes for coordinated sensitive-data removal and post-rewrite cleanup

### Why this is **not** `forward-only-acceptable`

**Evidence**
- local-path, session-telemetry, plugin-inventory, and private-registry residue recur across dozens of commits
- at least one committed fixture (`scripts/bench/__fixtures__/claude-stream-say-hi.jsonl`) preserves actual session telemetry rather than a synthetic sample
- GitHub public visibility exposes revision history and public Actions logs

**Inference**
- even without true secret material, leaving this legacy history public would create avoidable trust/optics drag and ongoing explanation burden

### Why `clean-public-snapshot-preferred` is the best fit

**Evidence**
- GitHub says rewrite has meaningful side effects and is mainly for sensitive-data cases
- GitHub Support will not remove non-sensitive data
- the repo has a lot of non-sensitive but unwanted historical residue

**Inference**
- a clean public snapshot/new public root gives the team the privacy/public-cleanliness benefit they likely want without paying the blast radius of a full rewrite that the security evidence does not justify

## Recommended strategy

1. Finish current-tree scrub / workflow / tarball gates already tracked in the cutover blueprint.
2. Publish from a **clean public snapshot** (or newly initialized public repo root) rather than exposing the full private legacy history.
3. Preserve provenance with:
   - this audit artifact
   - the cutover blueprint
   - release notes / ADR text describing that the public root intentionally starts after internal incubation
4. Keep **full history rewrite off the table** unless a future targeted audit finds actual sensitive material that survives rotation/revocation and current-tree cleanup.

## Decision summary for the blueprint

- **Chosen strategy class:** `clean-public-snapshot-preferred`
- **Evidence artifact:** `docs/research/2026-05-28-agent-kit-history-audit.md`
- **Escalation rule:** only switch to `rewrite-required` if a later audit finds real credential/private-key/must-remove-history evidence
