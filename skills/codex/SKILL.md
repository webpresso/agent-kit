---
name: codex
description: |
  Codex CLI wrapper for non-Codex hosts. Use for outside-voice code review,
  plan challenge, or read-only consultation when the user asks for Codex.
license: MIT
upstream:
  source: https://github.com/garrytan/gstack
---
<!-- Derived from MIT-licensed gstack workflow ideas; see packages/gstack/NOTICE.gstack.md. -->

# Codex outside voice

Use this skill from Claude or another non-Codex host when the user wants Codex to independently review a diff, challenge a plan, or answer a repo question. Keep Codex read-only by default and treat its answer as external advice until independently verified.

## Auth check

```bash
if ! codex login status >/dev/null 2>&1; then
  echo "CODEX_AUTH=missing: run codex login before using the codex outside-voice skill"
  exit 1
fi
echo "CODEX_AUTH=ok"
```

## Portable prompt file

```bash
PROMPT_FILE=$(mktemp -t wp-codex-review.XXXXXX)
trap 'rm -f "$PROMPT_FILE"' EXIT
```

## Modes

### Review

1. Capture the current branch, base branch, and `git diff --stat`.
2. Write a concise prompt asking Codex to find correctness, security, data-loss, and maintainability risks.
3. Run Codex non-interactively in read-only mode:

```bash
codex exec --sandbox read-only --ask-for-approval never --cd "$PWD" - <"$PROMPT_FILE"
```

4. Summarize findings with severity, evidence, and whether you independently verified them.

### Challenge

Ask Codex to argue against the current plan: hidden assumptions, failure modes, missing tests, and simpler alternatives.

### Consult

Ask a focused repo question. Include only the necessary file paths and snippets; do not send secrets.
