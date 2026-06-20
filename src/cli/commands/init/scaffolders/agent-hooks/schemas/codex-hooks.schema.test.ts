import { describe, expect, it } from 'vitest'

import { codexHooksSchema } from './codex-hooks.schema.js'

describe('codexHooksSchema', () => {
  it('rejects unknown top-level keys such as state', () => {
    const result = codexHooksSchema.safeParse({ hooks: {}, state: {} })

    expect(result.success).toBe(false)
  })

  it('accepts the canonical wrapped shape with no extra keys', () => {
    const result = codexHooksSchema.safeParse({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './run.sh' }] }] },
    })

    expect(result.success).toBe(true)
  })

  it('accepts an empty hooks map', () => {
    const result = codexHooksSchema.safeParse({ hooks: {} })

    expect(result.success).toBe(true)
  })
})
