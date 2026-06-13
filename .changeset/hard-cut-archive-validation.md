---
"@webpresso/agent-kit": major
---

Remove the public `archiveBlueprint` validation bypass from `webpresso/blueprint/local`.

`archiveBlueprint(slug, projectPath)` now always validates blueprint task completion before archiving. The previous third argument is no longer part of the API and truthy extra arguments from untyped JavaScript callers no longer allow incomplete blueprints to archive.
