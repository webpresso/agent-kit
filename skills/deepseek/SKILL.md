---
name: deepseek
description: |
  OpenCode Go outside-voice reviewer using DeepSeek reviewer. Use for read-only review,
  plan challenge, or implementation critique through the opencode CLI.
license: MIT
---

# DeepSeek reviewer via OpenCode Go

Use this skill when the user asks for a DeepSeek reviewer / OpenCode Go review from either the Claude plugin or the Codex plugin. It calls `opencode run` under the hood and should be treated as external advice until independently verified.

## Model routing

- Primary: `opencode-go/deepseek-v4-pro`
- Fallbacks: `opencode-go/deepseek-v4-flash`

Use DeepSeek Pro for implementation review and DeepSeek Flash for cheap/fast second passes or quota-friendly checks.

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
opencode run --model opencode-go/deepseek-v4-pro "$(cat "$PROMPT_FILE")"
```

If the primary model is unavailable or quota-limited, retry with one fallback from this skill's routing list.

## Current OpenCode Go catalog covered

| Family   | OpenCode Go model IDs                                                             |
| -------- | --------------------------------------------------------------------------------- |
| DeepSeek | `opencode-go/deepseek-v4-pro`, `opencode-go/deepseek-v4-flash`                    |
| GLM      | `opencode-go/glm-5.2`, `opencode-go/glm-5.1`                                      |
| Kimi     | `opencode-go/kimi-k2.7-code`, `opencode-go/kimi-k2.6`                             |
| MiniMax  | `opencode-go/minimax-m3`, `opencode-go/minimax-m2.7`                              |
| MiMo     | `opencode-go/mimo-v2.5-pro`, `opencode-go/mimo-v2.5`                              |
| Qwen     | `opencode-go/qwen3.7-max`, `opencode-go/qwen3.7-plus`, `opencode-go/qwen3.6-plus` |
