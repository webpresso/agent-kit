/**
 * Verify that markdown helpers are exported from the main package
 */

import { describe, expect, it } from 'vitest'

import {
  checkAllCheckboxes,
  checkFirstCheckbox,
  extractCodeBlocks,
  extractTaskSection,
  updateBlockedReason,
  updateTaskStatus,
} from '#index'

describe('plan-markdown-helpers exports', () => {
  it('should export checkFirstCheckbox', () => {
    expect(checkFirstCheckbox).toMatchObject(expect.any(Function))
    expect(typeof checkFirstCheckbox).toBe('function')
  })

  it('should export checkAllCheckboxes', () => {
    expect(checkAllCheckboxes).toMatchObject(expect.any(Function))
    expect(typeof checkAllCheckboxes).toBe('function')
  })

  it('should export updateBlockedReason', () => {
    expect(updateBlockedReason).toMatchObject(expect.any(Function))
    expect(typeof updateBlockedReason).toBe('function')
  })

  it('should export updateTaskStatus', () => {
    expect(updateTaskStatus).toMatchObject(expect.any(Function))
    expect(typeof updateTaskStatus).toBe('function')
  })

  it('should work as pure functions', () => {
    const input = `#### Task 1.1: Test

- [ ] First item
- [ ] Second item`
    const codeBlockInput = `\`\`\`mermaid
graph TD
A-->B
\`\`\`
`

    // Test checkFirstCheckbox
    const firstChecked = checkFirstCheckbox(input, '1.1')
    expect(firstChecked).toContain('- [x] First item')
    expect(firstChecked).toContain('- [ ] Second item')

    // Test checkAllCheckboxes
    const allChecked = checkAllCheckboxes(input, '1.1')
    expect(allChecked).toContain('- [x] First item')
    expect(allChecked).toContain('- [x] Second item')

    // Test updateBlockedReason
    const blocked = updateBlockedReason(input, '1.1', 'Testing')
    expect(blocked).toContain('**Blocked:** Testing')

    const withStatus = updateTaskStatus(input, '1.1', 'in-progress')
    expect(withStatus).toContain('**Status:** in-progress')

    // Test extractCodeBlocks
    expect(extractCodeBlocks(codeBlockInput, 'mermaid')).toEqual(['graph TD\nA-->B'])

    // Test extractTaskSection
    expect(extractTaskSection(input, '1.1')).toContain('#### Task 1.1: Test')

    // Verify original input unchanged (pure functions)
    expect(input).toContain('- [ ] First item')
    expect(input).not.toContain('[x]')
    expect(input).not.toContain('**Blocked:**')
  })
})
