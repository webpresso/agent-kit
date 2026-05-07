---
'@webpresso/agent-kit': patch
---

Fix `ak audit agents` reading `.codex/hooks.json` as flat-form when the
canonical Codex schema is wrapped under `"hooks"`.

`parseHooks` returned `parsed.hooks` for `claude` but raw `parsed` for
`codex`. The agent-hooks scaffolder writes wrapped form via
`hoistTopLevelEvents` (matching `https://developers.openai.com/codex/hooks`),
so every consumer with a freshly-scaffolded `.codex/hooks.json` saw the
audit report all 5 ak-* hooks as missing — even though they were present.
This false-positive blocked commits via the `audit agents` pre-commit
gate on consumers like `webpresso/monorepo`.

Now Codex audit reads `parsed.hooks` first (wrapped) and falls back to
`parsed` only when no `hooks` wrapper is present, preserving backwards-compat
with legacy pre-migration flat-form files.

Existing `seedConsumerRepo` test fixture updated to write the wrapped form
(matching what the scaffolder actually emits today). The self-hosting test
keeps the flat-form fixture to lock the backwards-compat path.
