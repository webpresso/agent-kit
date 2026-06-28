---
name: opencode-go
description: |
  OpenCode Go outside-voice reviewer using OpenCode Go aggregate reviewer. Use for read-only review,
  plan challenge, or implementation critique through the opencode CLI.
license: MIT
---

# OpenCode Go aggregate reviewer via OpenCode Go

Use this skill when the user asks for a OpenCode Go aggregate reviewer / OpenCode Go review from either the Claude plugin or the Codex plugin. It calls `opencode run` under the hood and should be treated as external advice until independently verified.

## Model routing

Versions change over time, so this skill does **not** hardcode a model ID. Resolve the current model from the live catalog (`opencode models opencode-go`) so new releases are picked up automatically.

Use the aggregate reviewer when the user wants an OpenCode Go review but did not specify a family. Prefer a high-signal code-review model (newest Qwen `-max`), falling back to the newest MiniMax, then DeepSeek `-pro`, then anything available.

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
# Aggregate reviewer: resolve a high-signal model from the live catalog
# (auto-updates as new OpenCode Go releases land — no hardcoded version):
CATALOG=$(opencode models opencode-go)
MODEL=$(echo "$CATALOG" | grep '^opencode-go/qwen' | grep -- '-max$' | sort -V | tail -1)
[ -z "$MODEL" ] && MODEL=$(echo "$CATALOG" | grep '^opencode-go/minimax' | sort -V | tail -1)
[ -z "$MODEL" ] && MODEL=$(echo "$CATALOG" | grep '^opencode-go/deepseek' | grep -- '-pro$' | sort -V | tail -1)
[ -z "$MODEL" ] && MODEL=$(echo "$CATALOG" | sort -V | tail -1)
opencode run --model "$MODEL" "$(cat "$PROMPT_FILE")"
```

If `$MODEL` is empty, your OpenCode Go catalog is empty — run `opencode models opencode-go` and verify the provider is connected.

## Live catalog

Model IDs drift, so this skill does not pin them. The authoritative list is
the live catalog:

```bash
opencode models opencode-go
```

The routing and review command above resolve a high-signal model from that
output at run time, so newly released versions are used automatically.
