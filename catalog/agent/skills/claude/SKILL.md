---
name: claude
description: |
  Claude Code CLI wrapper for non-Claude hosts. Use for outside-voice review,
  adversarial challenge, or read-only consultation when the user asks for a
  second opinion from Claude.
license: MIT
---

# Claude outside voice

Use this skill when the user wants Claude to independently review a diff, challenge a plan, or answer a repo question from a non-Claude host. Keep the call bounded, read-only unless the user explicitly asks otherwise, and report Claude's conclusions as external advice rather than as verified fact.

## Auth check

Use the local Claude CLI login directly. This is the Claude Max / first-party account path; do not route this skill through Anthropic API-key environment variables.

```bash
AUTH_STATUS_FILE=$(mktemp -t wp-claude-auth.XXXXXX)
trap 'rm -f "$AUTH_STATUS_FILE"' EXIT
if ! claude auth status --json >"$AUTH_STATUS_FILE" 2>/dev/null; then
  if ! claude auth status >"$AUTH_STATUS_FILE" 2>/dev/null; then
    echo "CLAUDE_AUTH=missing: run claude auth login with the intended Claude Max account"
    exit 1
  fi
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

Use single-file / single-question first for any non-trivial diff. Do not send a whole PR unless it already fits within the bounded payload below.

#### Bounded prompt payload

Always include:

- current branch and base branch
- `git diff --stat`
- changed file list
- one targeted file diff or one narrow snippet/hunk only, capped to a fixed size

Prefer a cap of roughly 12 KB or ~200 lines of diff/snippet text per Claude call. Split large reviews into multiple focused calls instead of increasing the cap.

```bash
BASE_BRANCH=${BASE_BRANCH:-origin/main}
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
TARGET_FILE=${TARGET_FILE:?set TARGET_FILE to one changed file}

{
  printf 'Outside review mode: focused diff review\n'
  printf 'Base branch: %s\nCurrent branch: %s\n\n' "$BASE_BRANCH" "$CURRENT_BRANCH"
  printf 'git diff --stat %s...HEAD\n' "$BASE_BRANCH"
  git diff --stat "$BASE_BRANCH"...HEAD
  printf '\nChanged files:\n'
  git diff --name-only "$BASE_BRANCH"...HEAD
  printf '\nTarget file: %s\n' "$TARGET_FILE"
  printf 'Bounded target diff (max 12000 bytes):\n'
  git diff --unified=3 "$BASE_BRANCH"...HEAD -- "$TARGET_FILE" | \
    head -c 12000
  printf '\n\nQuestion: Identify the highest-signal correctness, security, data-loss, or maintainability risk in %s. Quote only the smallest relevant excerpt. If context is insufficient, answer INSUFFICIENT_CONTEXT.\n' "$TARGET_FILE"
} >"$PROMPT_FILE"
```

#### Timed Claude wrapper

Run the review through a timeout wrapper. Use `claude --print`; do not recommend `--bare` for this path, because it breaks the intended first-party CLI-login mode in the reproduced environment.

```bash
CLAUDE_REVIEW_TIMEOUT_SECONDS=${CLAUDE_REVIEW_TIMEOUT_SECONDS:-180}
CLAUDE_REVIEW_TIMEOUT_SENTINEL=CLAUDE_REVIEW_TIMEOUT

node - "$PROMPT_FILE" "$CLAUDE_REVIEW_TIMEOUT_SECONDS" "$CLAUDE_REVIEW_TIMEOUT_SENTINEL" <<'JS'
const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')

const [promptPath, timeoutSecondsRaw, sentinel] = process.argv.slice(2)
const timeoutSeconds = Number(timeoutSecondsRaw)
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  console.error('CLAUDE_REVIEW_TIMEOUT_SECONDS must be a positive number')
  process.exit(1)
}

const prompt = readFileSync(promptPath, 'utf8')
const result = spawnSync('claude', ['--print', prompt], {
  encoding: 'utf8',
  timeout: timeoutSeconds * 1000,
  maxBuffer: 4 * 1024 * 1024,
})

if (result.error?.code === 'ETIMEDOUT') {
  console.error(sentinel)
  process.exit(124)
}
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exit(typeof result.status === 'number' ? result.status : 1)
JS
```

#### Split-and-retry-once fallback

1. First attempt: one file, one review question.
2. If that bounded call returns `CLAUDE_REVIEW_TIMEOUT`, retry once with an even smaller prompt: one hunk or one narrower question from the same file.
3. If the retry also returns `CLAUDE_REVIEW_TIMEOUT`, report Claude as unavailable for this review and stop.
4. Do not retry indefinitely and do not fall back to an unbounded whole-PR prompt.

Summarize findings with severity, evidence, and whether you independently verified them.

### Challenge

Ask Claude to argue against the current plan: hidden assumptions, failure modes, missing tests, and simpler alternatives.

### Consult

Ask a focused repo question. Include only the necessary file paths and snippets; do not send secrets.
