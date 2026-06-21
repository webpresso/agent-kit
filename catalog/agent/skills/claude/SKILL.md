---
name: claude
description: |
  Claude Code CLI wrapper for non-Claude hosts. Use for outside-voice review,
  adversarial challenge, or read-only consultation when the user asks for a
  second opinion from Claude.
license: MIT
upstream:
  source: https://github.com/garrytan/gstack
---
<!-- Derived from MIT-licensed gstack workflow ideas; see packages/gstack/NOTICE.gstack.md. -->

# Claude outside voice

Use this skill when the user wants Claude to independently review a diff, challenge a plan, or answer a repo question from a non-Claude host. Keep the call bounded, read-only unless the user explicitly asks otherwise, and report Claude's conclusions as external advice rather than as verified fact.

## Auth check

Use the local Claude CLI login directly. This is the Claude Max / first-party account path; do not route this skill through Anthropic API-key environment variables.

```bash
AUTH_STATUS_FILE=$(mktemp -t wp-claude-auth.XXXXXX)
trap 'rm -f "$AUTH_STATUS_FILE"' EXIT
if ! claude auth status >"$AUTH_STATUS_FILE" 2>/dev/null; then
  echo "CLAUDE_AUTH=missing: run claude auth login with the intended Claude Max account"
  exit 1
fi
if grep -E '"(authenticated|loggedIn|success)"[[:space:]]*:[[:space:]]*true' "$AUTH_STATUS_FILE" >/dev/null; then
  echo "CLAUDE_AUTH=cli-login"
else
  echo "CLAUDE_AUTH=missing: claude auth status did not report a recognized Claude CLI login"
  exit 1
fi
```

## Portable prompt file

Use a suffix-free `mktemp -t` pattern so macOS and Linux both work:

```bash
PROMPT_FILE=$(mktemp -t wp-claude-review.XXXXXX)
trap 'rm -f "$PROMPT_FILE"' EXIT
```

## Modes

### Review

1. Capture the current branch, base branch, and `git diff --stat`.
2. Write a concise prompt asking Claude to find correctness, security, data-loss, and maintainability risks.
3. Run `claude -p "$(cat "$PROMPT_FILE")"` from the repo root.
4. Summarize findings with severity, evidence, and whether you independently verified them.

### Challenge

Ask Claude to argue against the current plan: hidden assumptions, failure modes, missing tests, and simpler alternatives.

### Consult

Ask a focused repo question. Include only the necessary file paths and snippets; do not send secrets.
