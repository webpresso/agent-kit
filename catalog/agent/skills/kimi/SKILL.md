---
name: kimi
description: |
  OpenCode Go outside-voice reviewer using Kimi reviewer. Use for read-only review,
  plan challenge, or implementation critique through the opencode CLI.
license: MIT
---

# Kimi reviewer via OpenCode Go

Use this skill when the user asks for a Kimi reviewer / OpenCode Go review from either the Claude plugin or the Codex plugin. It calls `opencode run` under the hood and should be treated as external advice until independently verified.

## Model routing

- Primary: `opencode-go/kimi-k2.7-code`
- Fallbacks: `opencode-go/kimi-k2.6`

Use Kimi for agentic coding critique, implementation risk review, and alternative solution sketches.

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
opencode run --model opencode-go/kimi-k2.7-code --dir "$PWD" "$(cat "$PROMPT_FILE")"
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
