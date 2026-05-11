---
"@webpresso/agent-kit": minor
---

Two stale-`@webpresso/utils` surfaces fixed in agent-kit:

1. **`src/ai-tools/`** (5 files): the AI-tool implementations imported
   `getErrorMessage` / `formatBytes` / `StorageAdapter` / `SearchMatch`
   from `@webpresso/utils/{errors,format,storage-adapter}`. Now route
   through:
   - `@webpresso/runtime-format/errors` (getErrorMessage)
   - `@webpresso/runtime-format/format` (formatBytes)
   - `@webpresso/runtime-storage/storage-adapter` (StorageAdapter, SearchMatch)

2. **`src/hooks/pretool-guard/validators/package-imports.ts`**: the
   duplicate `SHARED_FUNCTIONS` registry (separate from the one in
   `src/quality-engine/package-import-rules.ts` already migrated in
   commit `afb9a73`) still mapped 37 symbols to `@webpresso/utils`.
   Now mirrors the quality-engine registry: string/format/date/
   duration → `@webpresso/runtime-format`, errors →
   `@webpresso/runtime-format` (source `errors`), id → `@webpresso/runtime`
   (source `utils/id`).

Catalog gained `@webpresso/runtime-format ^0.1.2` and
`@webpresso/runtime-storage ^0.1.2` + both added to
`minimumReleaseAgeExclude` (our own pre-release pubs).

Root `package.json`: dropped `@webpresso/utils`, added the two
thematic deps it actually needs at runtime.

Surfaced by `/verify` fact-check after the parent
consolidate-11-public cycle: previously typecheck passed only because
`@webpresso/utils` was still in local node_modules cache; a fresh
consumer install would 404 because the GH Package was deleted.
