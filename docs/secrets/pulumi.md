---
type: guide
title: Pulumi secret boundary
status: draft
created: 2026-06-19
last_updated: 2026-06-19
---

# Pulumi secret boundary

v1 supports env injection only.

Use:

```bash
wp secrets run --sink pulumi --profile preview -- <pulumi command>
```

Agent Kit does not create or mutate Pulumi ESC environments in v1.
