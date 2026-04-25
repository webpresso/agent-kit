# lore-protocol

Enforce Lore commit-message trailers using `ak audit commit-message`.

Lore is a lightweight protocol for embedding decision context directly into
commit messages — constraints, rejected alternatives, confidence, and
forward-looking directives — so future engineers understand *why* a change
was made, not just *what* changed.

## Quick start

```bash
# Validate a commit message file (hard-fail mode — exits non-zero on violations)
ak audit commit-message --message-file .git/COMMIT_EDITMSG --require-lore

# Soft-warn mode — emits warnings but always exits 0 (adoption ramp)
ak audit commit-message --message-file .git/COMMIT_EDITMSG --lore-warn

# Opt in per-commit by adding [lore] to the subject line:
# feat(auth): prevent silent session drops [lore]
```

## Install the commit-msg hook

```bash
ak setup --with lore-commits
```

This writes `.husky/commit-msg` containing:

```sh
#!/bin/sh
ak audit commit-message --require-lore --message-file "$1"
```

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
