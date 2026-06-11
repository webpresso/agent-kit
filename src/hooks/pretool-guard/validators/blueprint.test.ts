import { describe, expect, it } from 'vitest'

import { validateBlueprint } from './blueprint.js'

const writeInput = (filePath: string, content = '# doc') => ({
  cwd: '/repo',
  tool_input: { file_path: filePath, content },
})

const editInput = (filePath: string, oldString = 'old', newString = 'new') => ({
  cwd: '/repo',
  tool_input: { file_path: filePath, old_string: oldString, new_string: newString },
})

describe('pretool blueprint validator', () => {
  it('denies direct writes to flat canonical blueprint documents', () => {
    const result = validateBlueprint(writeInput('blueprints/planned/my-feature.md'))

    expect(result.passed).toBe(false)
    expect(result.message).toContain('mcp__webpresso__wp_blueprint(...)')
  })

  it('denies direct edits to folder overview blueprint documents', () => {
    const result = validateBlueprint(
      editInput('/repo/webpresso/blueprints/in-progress/my-feature/_overview.md'),
    )

    expect(result.passed).toBe(false)
    expect(result.message).toContain('mcp__webpresso__wp_blueprint(...)')
  })

  it('allows supporting markdown beside a canonical blueprint overview', () => {
    const result = validateBlueprint(writeInput('blueprints/planned/my-feature/notes.md'))

    expect(result).toEqual({ validator: 'blueprint', passed: true })
  })

  it('ignores non-file-edit tool inputs', () => {
    const result = validateBlueprint({ tool_input: { command: 'echo hi' } })

    expect(result).toEqual({ validator: 'blueprint', passed: true })
  })
})
