---
"@webpresso/agent-kit": patch
---

Fix `wp audit blueprint-lifecycle` (and other package-asset resolution) crashing with `ENOENT` in consumer repos. When the `wp` CLI runs as a bundled Bun single-file binary, `import.meta.url`/`process.argv` are `/$bunfs/root/...` virtual paths and `process.execPath` is the Bun binary — none point at the installed package — so `findPackageAsset` missed the shipped blueprint DB migrations and fell back to a non-existent cwd path. Add a Node module-resolution anchor (`require.resolve('@webpresso/agent-kit/package.json')` from cwd) plus a `./package.json` export, so assets resolve relative to the installed package regardless of Bun's virtual FS. Degrades to the existing start paths when the package isn't resolvable.
