---
"@webpresso/agent-kit": patch
---

Fix `base-kit` templates: invoke `ak` via `pnpm exec` instead of `npx`.

`ak setup --with base-kit` installs `.husky/pre-commit`, `.husky/commit-msg`,
and `.github/workflows/ci.webpresso.yml` from `catalog/base-kit/`. Previously
all three shelled out via `npx ak ...`, which routes through npm. In any
pnpm-only repo (i.e. all webpresso consumers), npm's arborist parses the
workspace and rejects pnpm-specific protocols like `catalog:` with
`EOVERRIDE`. The hook then exits 1 and every `git commit` that touches
`package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` fails — even
though `pnpm install --frozen-lockfile` itself accepts the same workspace
cleanly.

Switching to `pnpm exec` keeps everything in pnpm's resolution path. The
binary still resolves through `node_modules/.bin/ak`, but no npm process
is spawned and no workspace re-parse happens.

Files updated:

- `catalog/base-kit/.husky/pre-commit.tmpl`
- `catalog/base-kit/.husky/commit-msg.tmpl`
- `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl`

Consumers that already installed prior templates: re-run `ak setup
--overwrite --with base-kit`, or hand-edit the three files; the diff is
literally `s/npx/pnpm exec/`.
