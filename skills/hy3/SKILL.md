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

- Primary: `opencode-go/hy3-preview` (NOTE: not currently in the live OpenCode Go catalog — this skill is parked until HY3 returns; `opencode models opencode-go` to re-check)
- Fallbacks: none

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

Default to read-only review prompts: ask the model to inspect the diff/plan, cite concrete files, and avoid modifying files.

```bash
opencode run --model opencode-go/hy3-preview --dir "$PWD" "$(cat "$PROMPT_FILE")"
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
