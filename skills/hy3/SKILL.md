---
name: hy3
description: |
  OpenCode Go outside-voice reviewer using HY3 preview reviewer. Use for read-only review,
  plan challenge, or implementation critique through the opencode CLI.
license: MIT
---

# HY3 preview reviewer via OpenCode Go

Use this skill when the user asks for a HY3 preview reviewer / OpenCode Go review from either the Claude plugin or the Codex plugin. It calls `opencode run` under the hood and should be treated as external advice until independently verified.

## Model routing

This skill does **not** hardcode a model ID — it resolves the HY3 family from the live catalog (`opencode models opencode-go`). NOTE: HY3 is **not currently in the live OpenCode Go catalog**, so this skill is parked until HY3 returns; the resolution below will pick it up automatically once it reappears.

Use HY3 only when the user explicitly wants the preview model or a broad experimental comparison; prefer stable family skills for default reviews.

## Auth and availability check

OpenCode Go is configured like any other OpenCode provider: connect `OpenCode Go` in the TUI and confirm models are visible before running the reviewer.

```bash
opencode providers list >/dev/null
opencode models opencode-go >/dev/null
```

If OpenCode Go is missing, run `opencode`, use `/connect`, choose `OpenCode Go`, paste the Go API key, then run `/models` to verify access.

## Portable prompt file

```bash
PROMPT_FILE=$(mktemp -t wp-opencode-go-review.XXXXXX)
trap 'rm -f "$PROMPT_FILE"' EXIT
```

## Review command

Default to read-only review prompts: ask the model to inspect the diff/plan, cite concrete files, and avoid modifying files. Run from the repo directory — opencode already operates on the current working directory, so do NOT pass `--dir "$PWD"`: it forces a redundant full-repo index that stalls the review (and times out under load). For long reviews, write output to a file instead of piping through `head`/`tail` under a `timeout`, which discards buffered output when the process is killed.

```bash
# Resolve the HY3 model from the live catalog (auto-updates if HY3 returns):
MODEL=$(opencode models opencode-go | grep '^opencode-go/hy3' | sort -V | tail -1)
[ -z "$MODEL" ] && { echo "HY3 is not in the live OpenCode Go catalog — this reviewer is parked. Use a stable family skill (deepseek/glm/qwen/...) instead."; exit 1; }
opencode run --model "$MODEL" "$(cat "$PROMPT_FILE")"
```

If `$MODEL` is empty, HY3 has not returned to the catalog yet — use a stable family reviewer.

## Live catalog

Model IDs drift, so this skill does not pin them. The authoritative list is
the live catalog:

```bash
opencode models opencode-go
```

The routing and review command above resolve the `opencode-go/hy3` model from
that output at run time, so HY3 is used automatically if/when it returns.
