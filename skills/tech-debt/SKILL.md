---
type: skill
slug: tech-debt
title: tech-debt
status: active
scope: repo
applies_to: [agents]
related: []
created: "2026-05-07"
last_reviewed: "2026-05-07"
name: tech-debt
description: Manage the tech-debt lifecycle using `wp tech-debt` commands and `wp audit tech-debt`, including creation, review, and schema validation workflows.
---

# tech-debt

Manage the tech-debt lifecycle using `wp tech-debt` commands.

## Usage

```bash
# Create a new tech-debt item (written to webpresso/tech-debt/<status>/h-NNN-<kebab-title>.md)
wp tech-debt new "Legacy CLI complexity" \
  --severity medium \
  --category complexity \
  --review-cadence quarterly \
  --status accepted

# Preview without writing
wp tech-debt new "Performance bottleneck" --severity high --category mutation --dry-run

# List all tech-debt items (optional filters)
wp tech-debt list
wp tech-debt list --status accepted
wp tech-debt list --status needs-remediation --severity high
wp tech-debt list --category security

# Review: show items past their review date (exits non-zero if any are overdue)
wp tech-debt review

# Audit tech-debt files against the schema (CI gate)
wp audit tech-debt --root .
```

## File naming

Files are named `h-NNN-<kebab-title>.md` where `NNN` is auto-incremented across all status directories.

## Status lifecycle

```
accepted → needs-remediation → monitoring → resolved
```

## Severity + cadence rules

| Severity | Minimum cadence           |
| -------- | ------------------------- |
| critical | weekly (required)         |
| high     | biweekly or more frequent |
| medium   | monthly                   |
| low      | quarterly                 |

## Categories

`complexity`, `testing`, `mutation`, `duplication`, `dependency`, `security`, `documentation`

## Frontmatter schema (required fields)

```yaml
---
type: tech-debt
status: accepted # accepted | needs-remediation | monitoring | resolved
severity: medium # critical | high | medium | low
category: complexity # see categories above
review_cadence: quarterly # weekly | biweekly | monthly | quarterly
last_reviewed: "2026-01-15"
---
```
