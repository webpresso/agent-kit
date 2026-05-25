---
type: guide
title: Cross-Repo Correlation
description: How webpresso tracks and audits cross-repository blueprint dependencies.
last_updated: '2026-05-11'
---

# Cross-Repo Correlation

Webpresso blueprints can declare dependencies on blueprints in *other* repos via the `cross_repo_depends_on` frontmatter key. This doc explains how those references are stored, validated, and audited.

## The 7 requirements

### Req 1 — Org tagging (auto-detect at ingest)

When a blueprint is ingested, its `organization` field is auto-detected from `git remote get-url origin` in the blueprint's directory. The URL is parsed for both SSH and HTTPS forms:

- `git@github.com:webpresso/webpresso.git` → `webpresso`
- `https://github.com/webpresso/webpresso.git` → `webpresso`
- Fallback: `unknown`

Visibility is detected via `gh repo view --json visibility` (silent fail → `private`).

Both fields are cached on the `blueprints` row and reconciled on re-ingest.

### Req 2 — Default-deny cross-org

References to blueprints in a **different** org are denied by default. A cross-org dependency only resolves when **both sides** have allowlisted each other. Same-org dependencies always resolve.

### Req 3 — Explicit cross-org allowlist (both-sides)

Each repo commits a `.agent/correlate.allow.yaml` declaring which orgs it permits:

```yaml
# .agent/correlate.allow.yaml
permits:
  - trusted-partner   # permit correlations with blueprints in trusted-partner org
```

Both sides must have the other org in their `permits` list. One-sided entries are denied.

### Req 4 — Visibility-aware resolution (private slug → hash)

When a public blueprint references a blueprint in a private repo **and** the cross-org allowlist check fails:

- `target_slug` is set to `null` in `cross_repo_dependencies`
- `target_slug_hash` is set to `sha256(target_slug)`
- `is_redacted = 1`

This prevents the private slug from leaking into public markdown.

### Req 5 — Workspace scoping

`ingestWorkspaceRepos(db, cwd)` reads `~/.agent/workspace.yaml`, resolves each repo path, detects org + visibility via git remote and `gh`, and upserts into the `workspace_repos` table. This gives the audit visibility into which repos are private.

### Req 6 — Audit gate (FAIL LOUD, no auto-mutation)

`wp audit cross-repo-correlation` runs `auditCrossRepoCorrelation()` and fails with a non-zero exit code if any violation is found. It **never** auto-rewrites files or DB rows.

Two violation classes:

1. **LEAK** — a public blueprint has `is_redacted=0` and a `target_slug` pointing to a private-repo blueprint.
2. **MISSING ALLOWLIST** — a cross-org dependency exists but at least one side lacks an allowlist entry.

Requires `WP_USE_SQL_AUDITS=1` to run (same alpha gate as other SQL audits).

### Req 7 — 3rd-party fit (generic)

The entire model is org-agnostic. No org names are hardcoded in any cross-repo logic. Any adopter can use it by committing `.agent/correlate.allow.yaml` with their own org names.

---

## Permission model

```
Same org                  →  always resolves
Cross-org, no allowlist   →  DENIED (default deny)
Cross-org, one-sided      →  DENIED
Cross-org, both-sides     →  RESOLVES
```

Allowlist check:
```
source permits target  AND  target permits source  →  RESOLVES
```

---

## Worked examples

### Example 1: Same org (always resolves)

`webpresso/webpresso` has a blueprint that references `webpresso/monorepo`:

```yaml
cross_repo_depends_on:
  - repo: webpresso/monorepo
    slug: platform-api-hardening
```

Both repos are in the `webpresso` org. Resolution: **allowed**.

---

### Example 2: Cross-org (denied without mutual allowlist)

`webpresso/webpresso` references `acme-corp/product`:

```yaml
cross_repo_depends_on:
  - repo: acme-corp/product
    slug: acme-feature-x
```

- `webpresso/webpresso/.agent/correlate.allow.yaml` does **not** list `acme-corp`
- Resolution: **denied**, target slug redacted

To allow this, both repos must add each other:

`webpresso/webpresso/.agent/correlate.allow.yaml`:
```yaml
permits:
  - acme-corp
```

`acme-corp/product/.agent/correlate.allow.yaml`:
```yaml
permits:
  - webpresso
```

Now both sides allowlist each other → resolution: **allowed**.

---

### Example 3: Leak failure mode

`acme-corp/public-repo` has a blueprint:

```yaml
cross_repo_depends_on:
  - repo: other-org/private-repo
    slug: internal-migration-plan
```

- `other-org/private-repo` is **private**
- `acme-corp/public-repo` is **public**
- No mutual allowlist exists

At ingest time, `is_redacted=1` is set and `target_slug` is nulled. But if somehow an unredacted row slips into the DB (e.g., the allowlist was revoked after initial ingest), `wp audit cross-repo-correlation` will FAIL LOUD:

```
LEAK: public blueprint 'acme-feature' has unredacted reference to
private slug 'internal-migration-plan' in repo 'other-org/private-repo'.
Run 'wp fix cross-repo-leak acme-feature' to remediate.
```

---

## Remediation

The audit never auto-mutates. To fix a detected leak, run:

```bash
wp fix cross-repo-leak <blueprint-slug>
```

This redacts the target slug in the DB (sets `target_slug=null`, computes the hash, sets `is_redacted=1`). The source markdown also needs manual review to remove or redact the slug reference.

> Note: the `wp fix cross-repo-leak` verb exists as a placeholder in the CLI. The `fixCrossRepoLeak()` function in `src/blueprint/cross-repo/audit.ts` implements the DB remediation. Full CLI wiring is planned.

---

## File reference

| File | Purpose |
|------|---------|
| `src/blueprint/cross-repo/resolver.ts` | `resolvesCrossRepo()` — core permission check |
| `src/blueprint/cross-repo/allowlist.ts` | `loadAllowlist()` — reads `.agent/correlate.allow.yaml` |
| `src/blueprint/cross-repo/audit.ts` | `auditCrossRepoCorrelation()` + `fixCrossRepoLeak()` |
| `src/audit/cross-repo-correlation.ts` | Wraps audit into `RepoAuditResult` for the registry |
| `src/blueprint/db/workspace-config.ts` | `ingestWorkspaceRepos()` — upserts workspace repo metadata |
| `catalog/agent/correlate.allow.yaml` | Template deployed by `wp setup` |
