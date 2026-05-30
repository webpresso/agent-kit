---
'@webpresso/agent-kit': minor
---

Support both canonical blueprint shapes:

- `blueprints/<status>/<slug>.md`
- `blueprints/<status>/<slug>/_overview.md`

`wp blueprint new` now creates flat-file drafts by default, while lifecycle and
audit surfaces preserve the existing shape of each blueprint. Duplicate flat +
folder variants for the same lifecycle slug are now rejected as hard errors.
