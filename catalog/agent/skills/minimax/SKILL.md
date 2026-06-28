---
name: minimax
description: |
  OpenCode Go outside-voice reviewer using MiniMax reviewer. Use for read-only review,
  plan challenge, or implementation critique through the opencode CLI.
license: MIT
---

# MiniMax reviewer via OpenCode Go

Use this skill when the user asks for a MiniMax reviewer / OpenCode Go review from either the Claude plugin or the Codex plugin. It calls `opencode run` under the hood and should be treated as external advice until independently verified.

## Model routing

Versions change over time, so this skill does **not** hardcode a model ID. Resolve the current model from the live catalog (`opencode models opencode-go`) so new releases are picked up automatically. This reviewer uses the **MiniMax** family on OpenCode Go (use the newest MiniMax version).

Use MiniMax for high-throughput review, implementation critique, and availability-friendly second opinions.

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
# Resolve the current best model from the live catalog (auto-updates as new
# OpenCode Go releases land — no hardcoded version to go stale):
CATALOG=$(opencode models opencode-go)
MODEL=$(echo "$CATALOG" | grep '^opencode-go/minimax' | sort -V | tail -1)
opencode run --model "$MODEL" "$(cat "$PROMPT_FILE")"
```

If `$MODEL` is empty, the MiniMax family is absent from your OpenCode Go catalog — run `opencode models opencode-go` and pick a reviewer family that is present.

## Live catalog

Model IDs drift, so this skill does not pin them. The authoritative list is
the live catalog:

```bash
opencode models opencode-go
```

The routing and review command above resolve the right `opencode-go/minimax`
model from that output at run time, so newly released versions are used
automatically.
