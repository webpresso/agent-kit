---
type: research
last_updated: '2026-05-28'
---

# Agent Kit clean public snapshot / new public root strategy

> **Status note (2026-05-28):** This document records the recommended
> `clean-public-snapshot-preferred` strategy from the bounded audit. The operator
> later overrode that recommendation and made the existing
> `webpresso/agent-kit` repository public directly. Treat this artifact as the
> documented recommendation / fallback strategy, not the path that was actually
> executed.

Date: 2026-05-28
Repo: `/Users/ozby/repos/webpresso/agent-kit`
Blueprint: `agent-kit-public-npm-cutover-implementation`
Task: `4.3`

## Decision

**Chosen execution path:** `clean-public-snapshot-preferred`

- **History rewrite required?** No.
- **Public visibility allowed on the legacy repo?** No.
- **Concrete cutover shape:** keep the existing private repository private, preserve its full legacy history there, and publish `webpresso/agent-kit` from a **fresh public root commit** created from a verified cutover snapshot.

This matches the bounded audit in `docs/research/2026-05-28-agent-kit-history-audit.md`: the repo does not currently justify a coordinated sensitive-data rewrite, but it also should not expose its full private revision history.

## GitHub facts this strategy relies on

Official GitHub guidance reviewed on 2026-05-28:

- GitHub says rewriting history has significant side effects and is primarily for sensitive-data cases, and GitHub Support will not remove non-sensitive data after the fact.
- GitHub says that making a repository public exposes the code, revision history, and Actions logs.
- GitHub says a repository rename redirects the old URL, but that redirect stops being useful once the old name is reused for a new repository.

Sources:

- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
- https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories
- https://docs.github.com/github/administering-a-repository/managing-repository-settings/renaming-a-repository

## Repo-admin state verified in this lane

Verified on 2026-05-28 with `gh repo view --json nameWithOwner,isPrivate,defaultBranchRef,url,viewerPermission`:

- repo: `webpresso/agent-kit`
- current visibility: **private**
- default branch: `main`
- current access from this lane: **ADMIN**

This means the repository can be renamed and a fresh public replacement can be created when the cutover commit is ready.

## Concrete choreography

### 1) Freeze the private source of truth

Do **not** make the current private repository public.

Instead:

1. finish the release-rehearsal lane and package/doc/workflow cutover work
2. choose the exact cutover SHA to export
3. record that SHA in the release notes / maintainer handoff

The public repo should start from one verified SHA, not from a moving worktree.

### 2) Build a curated export for the public root

Create the public root from the final approved cutover commit, not from historical refs.

Recommended local flow:

```bash
cd /Users/ozby/repos/webpresso/agent-kit
CUTOVER_SHA="<final-approved-sha>"
EXPORT_DIR="$(mktemp -d /tmp/agent-kit-public-root-XXXXXX)"

git archive --format=tar "$CUTOVER_SHA" | tar -xf - -C "$EXPORT_DIR"
```

Then prune or omit private-only repository material before the first public commit. At minimum, the public root should not carry forward:

- private planning/history material (`blueprints/`, private research notes, OMX state)
- agent-runtime state folders and local tooling caches
- maintainer-only contracts that expose workstation-specific or incubation-only context
- any file that still fails the public-readiness grep or secret/history checks

The clean public repo should contain the product surface, public docs, tests/fixtures that are intentionally public, release metadata, and GitHub workflow/config needed for outside contributors.

### 3) Create a fresh public history locally

Initialize a brand-new Git history from the curated export:

```bash
cd "$EXPORT_DIR"
rm -rf .git
git init -b main
git add .
git commit -m "chore: start public history from verified snapshot ($CUTOVER_SHA)"
git tag public-root-2026-05-28
```

Recommended provenance note for the new public history:

- add one short sanitized maintainer/public note stating that public history intentionally begins from a clean snapshot after private incubation
- do **not** restate the unwanted historical residue classes verbatim in that public note
- keep the detailed audit artifact in the private repo history, not in the new public root

### 4) Swap the GitHub repository identity

Preferred same-name cutover:

1. rename the current private repo from `webpresso/agent-kit` to an internal/private archival name such as `webpresso/agent-kit-internal`
2. keep that renamed repository private
3. create a **new** GitHub repository named `webpresso/agent-kit`
4. create it as **public**, empty, and without auto-generated starter files
5. add the new repo as `origin` for the fresh public-root repo and push `main`

Why this shape:

- it preserves the full internal history without rewriting it
- it avoids making legacy commits public
- it gives the public repo a clean initial history with intentional provenance

Important operational note:

- once the original name is reused for the new public repo, GitHub's rename redirect is no longer the long-term compatibility story
- collaborators who still need the private archival repo must update their remotes to the renamed private URL explicitly

### 5) Post-push verification on the new public repo

Run verification against the **new public-root repo**, not the private legacy repo:

```bash
# repo identity

gh repo view webpresso/agent-kit --json nameWithOwner,isPrivate,defaultBranchRef,url

# history shape: exactly the fresh public root, plus any later public commits

git log --oneline --decorate --graph --all

# current-tree public checks

npm pack --dry-run --json
npm run verify:secrets
npm run audit:secret-provider-quarantine
npm run lint:pkg

# targeted residue grep over the public tree

rg -n '/Users/ozby|~/.claude|npm\.pkg\.github\.com|GH_PACKAGES_TOKEN|x-access-token:|ozby/context-mode' .

# history scan over the surviving public history only

gitleaks git . --log-opts='--all' --redact
```

Success criteria for the new public repo:

- the repo is public
- the public history begins at the new public-root commit
- the exported tree passes the current-tree checks
- the surviving public history passes the history scan appropriate for the public root
- no maintainer-only archival repo needs to be made public

## What this lane verified vs what remains pending

### Verified now

- the strategy class remains **clean public snapshot**, not full rewrite
- the current GitHub repo is still **private**, with admin access available for the eventual rename/create choreography
- the correct operational cutover is **rename private legacy repo -> create new public repo -> push fresh public root**, not "flip the existing repo to public"

### Verified as intentionally **not ready yet**

A local export rehearsal from committed `HEAD` (`95a770b0a379b256fe215db14a41a2cea5b2e227`) still surfaced pre-cutover residue in tracked files, including package/docs/test content owned by the other lane's release-rehearsal work. That is expected because this lane was explicitly asked **not** to edit:

- release workflow
- `package.json`
- `.claude` policy
- rehearsal-owned files

So this lane does **not** claim that the currently committed private `HEAD` is already the final public-root candidate.

### Still pending before actual GitHub execution

1. the other lane's release/doc/workflow cutover changes must land in a final approved commit
2. the curated export must be regenerated from that final SHA
3. the public-root verification commands above must pass on that regenerated export
4. a maintainer must perform the GitHub rename/create/push choreography
5. the blueprint/rehearsal owner lane must record the final evidence in the blueprint and gate state

## Handoff summary

- **Strategy artifact:** `docs/research/2026-05-28-agent-kit-clean-public-snapshot-strategy.md`
- **Exact strategy:** preserve the private legacy repo and publish a new public repo from a fresh clean root
- **Execution state:** choreography is now specified and repo-admin assumptions are verified; actual GitHub cutover remains intentionally deferred until the other lane's final cutover SHA is ready
