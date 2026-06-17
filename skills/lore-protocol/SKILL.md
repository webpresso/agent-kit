---
type: skill
slug: lore-protocol
title: lore-protocol
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-07'
last_reviewed: '2026-05-07'
name: lore-protocol
description: Use Lore commit-message trailers manually with `wp audit commit-message`; hook enforcement is intentionally not installed because PRs use squash commits.
---

# lore-protocol

Use Lore commit-message trailers manually with `wp audit commit-message`. Hook enforcement is intentionally not installed because this repo uses squash commits.

Lore is a lightweight protocol for embedding decision context directly into
commit messages — constraints, rejected alternatives, confidence, and
forward-looking directives — so future engineers understand *why* a change
was made, not just *what* changed.

## Quick start

```bash
# Validate a commit message file (hard-fail mode — exits non-zero on violations)
wp audit commit-message --message-file .git/COMMIT_EDITMSG --require-lore

# Soft-warn mode — emits warnings but always exits 0 (adoption ramp)
wp audit commit-message --message-file .git/COMMIT_EDITMSG --lore-warn

# Opt in per-commit by adding [lore] to the subject line:
# feat(auth): prevent silent session drops [lore]
```

## Hook policy

Lore trailers are advisory/manual. Do not install commit-msg or pre-push hooks for Lore enforcement; squash commits are the durable review boundary.

## Trailer format

```
<intent line: why the change was made, not what changed>

<body: narrative context — constraints, approach rationale>

Constraint: <external constraint that shaped the decision>
Rejected: <alternative considered> | <reason for rejection>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Directive: <forward-looking warning for future modifiers>
Tested: <what was verified>
Not-tested: <known gaps in verification>
```

## Required trailers (for `--require-lore` or `[lore]` subject tag)

| Trailer | Required | Allowed values |
|---------|----------|---------------|
| `Confidence:` | yes | `low`, `medium`, `high` |
| `Constraint:` or `Rejected:` or `Directive:` | at least one | free text |
| `Scope-risk:` | optional | `narrow`, `moderate`, `broad` |
| `Reversibility:` | optional | `clean`, `messy`, `irreversible` |
| `Tested:` | optional | free text |
| `Not-tested:` | optional | free text |
| `Related:` | optional | free text |

## Example commit

```
Prevent silent session drops during long-running operations

The auth service returns inconsistent status codes on token
expiry, so the interceptor catches all 4xx responses.

Constraint: Auth service does not support token introspection
Rejected: Extend token TTL to 24h | security policy violation
Confidence: high
Scope-risk: narrow
Directive: Error handling is broad — do not narrow without verifying upstream behavior
Tested: Single expired token refresh (unit)
Not-tested: Auth service cold-start > 500ms behavior
```
