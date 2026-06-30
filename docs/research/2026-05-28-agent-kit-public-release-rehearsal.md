---
type: research
last_updated: "2026-05-28"
---

# Agent Kit public release rehearsal

Date: 2026-05-28
Repo: `/Users/ozby/repos/webpresso/agent-kit`
Commit: `95a770b0a379b256fe215db14a41a2cea5b2e227`
Blueprint lane: `agent-kit-public-npm-cutover-implementation` Task 4.2 (artifact-only lane; no blueprint edits)

## Verdict

> **Status note:** The original rehearsal below is preserved as the first failed pass.  
> After Tasks **3.5** and **3.6** landed, the rehearsal was rerun successfully for
> package-installability and publish-dry-run behavior. See the addendum below.

- **Package readiness:** `FAIL`
- **Repo visibility readiness:** `BLOCKED`
- **Overall rehearsal:** **do not publish / do not flip visibility yet**

Why this is a `FAIL`, not just a `BLOCKED`:

1. The implemented gate still reports `Package readiness: PASS`, but the consumer install rehearsal failed hard.
2. The packed tarball still ships `catalog:` dependency specifiers in `package/package.json`, which npm consumers cannot install.
3. `npm publish --dry-run --access public` also emitted bin auto-correction warnings that removed every declared CLI bin during publish simulation.

## Re-run after Tasks 3.5 and 3.6

Date: 2026-05-28
Scope: same repo, after packed-manifest and bin-contract fixes landed

### Updated verdict

- **Package readiness:** `PASS`
- **Repo visibility readiness:** `BLOCKED`
- **Overall rehearsal:** **do not flip GitHub visibility yet; package-side blockers from the first pass are now cleared**

### Commands rerun

```bash
npm run public:readiness
npm pack --dry-run --json
npm run lint:pkg
PACK_DIR=$(mktemp -d); PREFIX_DIR=$(mktemp -d); TARBALL=$(npm pack --pack-destination "$PACK_DIR" 2>/dev/null | tail -n1); npm install --prefix "$PREFIX_DIR" --package-lock=false "$PACK_DIR/$TARBALL"
PACK_DIR2=$(mktemp -d); REPO_DIR=$(mktemp -d); git -C "$REPO_DIR" init -q; git -C "$REPO_DIR" config user.email noreply@example.com; git -C "$REPO_DIR" config user.name test; git -C "$REPO_DIR" commit --allow-empty -q -m bootstrap; TARBALL2=$(npm pack --pack-destination "$PACK_DIR2" 2>/dev/null | tail -n1); (cd "$REPO_DIR" && npm exec --yes --package "$PACK_DIR2/$TARBALL2" -- wp setup)
npm publish --dry-run --access public
```

### Updated results

- `npm run public:readiness` → exit `0`
  - `Package readiness: PASS`
  - `Repo visibility readiness: BLOCKED`
- `npm pack --dry-run --json` → exit `0`
  - `entryCount=1230`
  - `size=1028086`
  - `unpackedSize=3687036`
- `npm run lint:pkg` → exit `0`
  - same remaining non-blocking publint warning about nested `dist/esm/package.json#imports`
  - `attw` passed
  - marketplace validation passed
- consumer install rehearsal via packed tarball → exit `0`
  - installed package manifest reported `catalogSpecs: []`
- docs-style one-shot setup rehearsal (`npm exec --package <tarball> -- wp setup`) → completed successfully
  - package install now works
  - the packaged CLI runs
- `npm publish --dry-run --access public` → exit `0`
  - no `npm warn publish npm auto-corrected...`
  - no `bin[...] was invalid and removed`

### Remaining blockers after rerun

- **GitHub visibility remains intentionally blocked** because the chosen strategy is still `clean-public-snapshot-preferred` and Task 4.3 has not executed the rename/new-public-root choreography yet.
- The current package gate now behaves correctly; the remaining blocker is the repo-history/public-visibility lane, not package installability/publish mechanics.

## Commands run and results

### 1) Public-readiness gate

```bash
npm run public:readiness
```

Exit code: `0`

Exact output:

```text
Package readiness: PASS
Repo visibility readiness: BLOCKED

[PASS] forbidden-env-files: ok
[PASS] secret-provider-quarantine: ok
[PASS] package-surface-audit: ok
[PASS] install-docs-lint: ok
[PASS] package-metadata: @webpresso/agent-kit + public npm publishConfig present
[PASS] tarball-banned-paths: entryCount=1230, size=1028017, unpacked=3686965
[PASS] stale-surface-literals: no stale registry/auth/local-path literals on shipped/public surfaces
[PASS] public-target-positive-assertions: updater/help surfaces resolve to the intended public package + npm registry target
[PASS] tracked-generated-artifacts: no tracked .test-plan-service artifacts
[PASS] history-audit-artifact: clean-public-snapshot-preferred
[BLOCKED] repo-visibility-readiness: clean-public-snapshot-preferred; Task 4.3 still pending
```

Interpretation:

- The current gate is doing its intended split: **package** vs **repo visibility**.
- However, the gate is currently **insufficient** as a final publish rehearsal because it did **not** catch the consumer install failure below.

### 2) Narrowed package surface check

```bash
npm pack --dry-run --json
```

Exit code: `0`

Exact summary extracted from the command output:

```json
{
  "id": "@webpresso/agent-kit@0.21.0",
  "filename": "webpresso-agent-kit-0.21.0.tgz",
  "entryCount": 1230,
  "size": 1028017,
  "unpackedSize": 3686965
}
```

Notes:

- The tarball shape matches the gate's `tarball-banned-paths` summary.
- This command alone is **not** enough to prove outside-user installability.

### 3) Narrowed package lint / publish-surface check

```bash
npm run lint:pkg
```

Exit code: `0`

Exact notable output:

```text
Running publint v0.3.20 for @webpresso/agent-kit...
Packing files with `pnpm pack`...
Linting...
Warnings:
1. ./dist/esm/package.json has an "imports" field, but it is ignored by Node.js. The field only works in root package.json files and not nested ones. Some bundlers may still pick them up, leading to inconsistent resolution. Consider removing it.
```

`attw --pack .` completed cleanly for the exported surfaces, and the local Claude marketplace validation ended with:

```text
Validating marketplace manifest: /Users/ozby/repos/webpresso/agent-kit/.claude-plugin/marketplace.json

✔ Validation passed
```

### 4) Relevant targeted tests

```bash
bunx vitest run src/audit/package-surface.test.ts src/cli/commands/init/init.e2e.test.ts
```

Exit code: `0`

Exact summary:

```text
Test Files  2 passed (2)
     Tests  27 passed (27)
  Start at  19:13:34
  Duration  15.13s (transform 78ms, setup 0ms, import 195ms, tests 24.88s, environment 0ms)
```

Interpretation:

- Existing package-surface and setup E2E tests are green.
- They still do **not** cover the real packaged npm-consumer install path that failed below.

### 5) Consumer install rehearsal against the packed tarball

Rehearsal command:

```bash
PACK_DIR=$(mktemp -d)
PREFIX_DIR=$(mktemp -d)
TARBALL=$(npm pack --pack-destination "$PACK_DIR" 2>/dev/null | tail -n1)
npm install --prefix "$PREFIX_DIR" "$PACK_DIR/$TARBALL"
```

Exit code: `1`

Exact output:

```text
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "catalog:": catalog:
```

This is the release-blocking package failure.

### 6) Public-docs-path one-shot setup rehearsal (no `vp`)

Rehearsal command:

```bash
PACK_DIR=$(mktemp -d)
REPO_DIR=$(mktemp -d)
git -C "$REPO_DIR" init -q
git -C "$REPO_DIR" commit --allow-empty -q -m bootstrap
npm pack --pack-destination "$PACK_DIR" >/tmp/wp-pack-path.txt
TARBALL=$(tail -n1 /tmp/wp-pack-path.txt)
cd "$REPO_DIR"
npm exec --yes --package "$PACK_DIR/$TARBALL" -- wp setup
```

Exit code: `1`

Exact tail output:

```text
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "catalog:": catalog:
```

Interpretation:

- The **documented no-`vp` path is currently broken** when exercised against the packed artifact.
- Because install fails before the CLI runs, follow-up observability commands such as `wp hooks doctor` / `wp audit guardrails` could not be rehearsed on the packaged install path.

### 7) Root-cause evidence from the packed tarball manifest

Rehearsal command:

```bash
PACK_DIR=$(mktemp -d)
TARBALL=$(npm pack --pack-destination "$PACK_DIR" 2>/dev/null | tail -n1)
tar -xOf "$PACK_DIR/$TARBALL" package/package.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const pkg=JSON.parse(s); for (const section of ["dependencies","devDependencies"]) { const hits=Object.fromEntries(Object.entries(pkg[section]||{}).filter(([,v])=>typeof v==="string"&&v.startsWith("catalog:"))); console.log(section, JSON.stringify(hits)); }})'
```

Exit code: `0`

Exact output:

```text
dependencies {"@vitejs/plugin-react":"catalog:","@manypkg/find-root":"catalog:","gray-matter":"catalog:","remark-frontmatter":"catalog:","vite-plus":"catalog:","yaml":"catalog:","zod":"catalog:"}
devDependencies {"@arethetypeswrong/cli":"catalog:","@secretlint/secretlint-rule-preset-recommend":"catalog:","@stryker-mutator/core":"catalog:","@stryker-mutator/typescript-checker":"catalog:","@stryker-mutator/vitest-runner":"catalog:","@types/node":"catalog:","secretlint":"catalog:","tshy":"catalog:","typescript":"catalog:","vite":"catalog:","vitest":"catalog:"}
```

This explains the install failure directly: the shipped manifest still contains unresolved `catalog:` specifiers.

### 8) Publish-path dry rehearsal

```bash
npm publish --dry-run --access public
```

Exit code: `0`

Exact notable output:

```text
npm warn publish npm auto-corrected some errors in your package.json when publishing.  Please run "npm pkg fix" to address these errors.
npm warn publish errors corrected:
npm warn publish "bin[wp]" script name bin/wp.js was invalid and removed
npm warn publish "bin[wp-pretool-guard]" script name bin/wp-pretool-guard.js was invalid and removed
npm warn publish "bin[wp-post-tool]" script name bin/wp-post-tool.js was invalid and removed
npm warn publish "bin[wp-stop-qa]" script name bin/wp-stop-qa.js was invalid and removed
npm warn publish "bin[wp-guard-switch]" script name bin/wp-guard-switch.js was invalid and removed
npm warn publish "bin[wp-test-quality-check]" script name bin/wp-test-quality-check.js was invalid and removed
npm warn publish "bin[wp-sessionstart-routing]" script name bin/wp-sessionstart-routing.js was invalid and removed
npm warn publish "bin[wp-check-dev-link]" script name bin/wp-check-dev-link.js was invalid and removed
npm warn publish "bin[wp-restore-dev-links]" script name bin/wp-restore-dev-links.js was invalid and removed
npm warn publish "bin[docs-check-internal-links]" script name bin/docs-check-internal-links.js was invalid and removed
npm warn publish "bin[docs-check-refs]" script name bin/docs-check-refs.js was invalid and removed
npm warn publish "bin[docs-check-stale]" script name bin/docs-check-stale.js was invalid and removed
npm warn publish "bin[docs-lint]" script name bin/docs-lint.js was invalid and removed
npm warn publish "bin[docs-migrate]" script name bin/docs-migrate.js was invalid and removed
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
+ @webpresso/agent-kit@0.21.0
```

Interpretation:

- The publish dry-run reached npm's dry-run publish stage.
- But npm reported that it **auto-corrected and removed every declared bin entry** during publish simulation.
- That warning needs follow-up before a real publish, because the package's CLI surface (`wp`, hook helpers, docs helpers) is core product behavior.

## Residual caveats / blockers

### Hard blockers discovered in this rehearsal

1. **Packed manifest still contains `catalog:` dependency specifiers.**
   - Impact: npm consumers cannot install the tarball.
   - Evidence: `npm install --prefix ... "$PACK_DIR/$TARBALL"` failed with `EUNSUPPORTEDPROTOCOL`.
   - Root-cause proof: extracted `package/package.json` from the tarball still contains `catalog:` in both `dependencies` and `devDependencies`.

2. **Public no-`vp` setup story is not actually executable yet.**
   - Impact: the README/docs one-shot npm path cannot be trusted for outside users.
   - Evidence: `npm exec --yes --package "$PACK_DIR/$TARBALL" -- wp setup` failed before CLI startup with the same `catalog:` protocol error.

3. **Publish dry-run emitted bin-removal warnings.**
   - Impact: unclear whether a real publish would preserve the intended CLI/bin surface.
   - Evidence: `npm publish --dry-run --access public` auto-corrected and removed all declared `bin[...]` entries in the dry-run manifest.

### Separate non-package blocker still pending from the other lane

4. **Repo visibility is still intentionally blocked.**
   - Gate evidence: `Repo visibility readiness: BLOCKED`
   - Reason: history audit classification is `clean-public-snapshot-preferred`, and Task 4.3 is still pending in the active blueprint state this lane observed.

## Bottom line

The implemented gate currently says:

- **Package readiness:** PASS
- **Repo visibility readiness:** BLOCKED

But the final rehearsal evidence says the stronger truth is:

- **Package readiness:** FAIL
- **Repo visibility readiness:** BLOCKED

So this lane should hand back a **release-blocking package defect**, not a go/no-go pass.
