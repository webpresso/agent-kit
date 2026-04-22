/**
 * Plan Markdown Helpers - Tests
 *
 * Pure function tests for markdown patching operations.
 * These helpers are idempotent and used by AgentBlueprintContext.
 */

import { describe, expect, it } from 'vitest'

import {
  checkAllCheckboxes,
  checkFirstCheckbox,
  extractCodeBlocks,
  extractTaskSection,
  updateBlockedReason,
  updateTaskStatus,
} from './helpers.js'

describe('plan-markdown-helpers', () => {
  describe('extractCodeBlocks', () => {
    it('extracts multiple mermaid blocks', () => {
      const content = `# Title

\`\`\`mermaid
graph TD
A-->B
\`\`\`

Text

\`\`\`mermaid
graph LR
X-->Y
\`\`\`
`

      expect(extractCodeBlocks(content, 'mermaid')).toEqual(['graph TD\nA-->B', 'graph LR\nX-->Y'])
    })

    it('returns empty array when no matching language exists', () => {
      const content = `\`\`\`ts\nconst x = 1\n\`\`\``
      expect(extractCodeBlocks(content, 'mermaid')).toEqual([])
    })
  })

  describe('checkFirstCheckbox', () => {
    it('should check the first unchecked checkbox in task section', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies
- [ ] Configure environment`

      const expected = `#### Task 1.1: Setup

- [x] Install dependencies
- [ ] Configure environment`

      expect(checkFirstCheckbox(input, '1.1')).toBe(expected)
    })

    it('should be idempotent when called twice (checks next box)', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies
- [ ] Configure environment`

      const firstRun = checkFirstCheckbox(input, '1.1')
      const secondRun = checkFirstCheckbox(firstRun, '1.1')

      // First run checks first box
      expect(firstRun).toContain('- [x] Install dependencies')
      expect(firstRun).toContain('- [ ] Configure environment')

      // Second run checks second box
      expect(secondRun).toContain('- [x] Install dependencies')
      expect(secondRun).toContain('- [x] Configure environment')
    })

    it('should not affect other task sections', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies

#### Task 1.2: Build

- [ ] Create components`

      const result = checkFirstCheckbox(input, '1.1')

      expect(result).toContain('- [x] Install dependencies')
      expect(result).toContain('- [ ] Create components') // Task 1.2 unchanged
    })

    it('should return unchanged content if no unchecked boxes exist', () => {
      const input = `#### Task 1.1: Setup

- [x] All done`

      expect(checkFirstCheckbox(input, '1.1')).toBe(input)
    })

    it('should handle task with no checkboxes', () => {
      const input = `#### Task 1.1: Setup

No checkboxes here.`

      expect(checkFirstCheckbox(input, '1.1')).toBe(input)
    })

    it('should handle task ID with special regex characters', () => {
      const input = `#### Task 1.1: Setup

- [ ] First item`

      const result = checkFirstCheckbox(input, '1.1')
      expect(result).toContain('- [x] First item')
    })
  })

  describe('checkAllCheckboxes', () => {
    it('should check all unchecked checkboxes in task section', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies
- [ ] Configure environment
- [ ] Run tests`

      const expected = `#### Task 1.1: Setup

- [x] Install dependencies
- [x] Configure environment
- [x] Run tests`

      expect(checkAllCheckboxes(input, '1.1')).toBe(expected)
    })

    it('should be idempotent (running twice produces same output)', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies
- [ ] Configure environment`

      const firstRun = checkAllCheckboxes(input, '1.1')
      const secondRun = checkAllCheckboxes(firstRun, '1.1')

      expect(firstRun).toBe(secondRun)
      expect(firstRun).toContain('- [x] Install dependencies')
      expect(firstRun).toContain('- [x] Configure environment')
    })

    it('should not affect other task sections', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies

#### Task 1.2: Build

- [ ] Create components`

      const result = checkAllCheckboxes(input, '1.1')

      expect(result).toContain('- [x] Install dependencies')
      expect(result).toContain('- [ ] Create components') // Task 1.2 unchanged
    })

    it('should handle mix of checked and unchecked boxes', () => {
      const input = `#### Task 1.1: Setup

- [x] Install dependencies
- [ ] Configure environment
- [x] Run tests`

      const result = checkAllCheckboxes(input, '1.1')

      expect(result).toContain('- [x] Install dependencies')
      expect(result).toContain('- [x] Configure environment')
      expect(result).toContain('- [x] Run tests')
    })

    it('should return unchanged content if all boxes already checked', () => {
      const input = `#### Task 1.1: Setup

- [x] All done
- [x] Everything checked`

      expect(checkAllCheckboxes(input, '1.1')).toBe(input)
    })

    it('should handle task with no checkboxes', () => {
      const input = `#### Task 1.1: Setup

No checkboxes here.`

      expect(checkAllCheckboxes(input, '1.1')).toBe(input)
    })

    it('handles lane-prefixed task headings without touching neighboring tasks', () => {
      const input = `#### [backend] Task 1.1: Setup

- [ ] Install dependencies
- [ ] Configure environment

#### [ui] Task 1.2: Build

- [ ] Create components`

      const result = checkAllCheckboxes(input, '1.1')

      expect(result).toContain('#### [backend] Task 1.1: Setup')
      expect(result).toContain('- [x] Install dependencies')
      expect(result).toContain('- [x] Configure environment')
      expect(result).toContain('#### [ui] Task 1.2: Build')
      expect(result).toContain('- [ ] Create components')
    })
  })

  describe('updateBlockedReason', () => {
    it('should add blocked reason after task title', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies`

      const result = updateBlockedReason(input, '1.1', 'Waiting for API approval')

      expect(result).toContain('#### Task 1.1: Setup')
      expect(result).toContain('**Blocked:** Waiting for API approval')
      expect(result).toContain('- [ ] Install dependencies')
    })

    it('should update existing blocked reason', () => {
      const input = `#### Task 1.1: Setup

**Blocked:** Old reason

- [ ] Install dependencies`

      const result = updateBlockedReason(input, '1.1', 'New reason')

      expect(result).toContain('**Blocked:** New reason')
      expect(result).not.toContain('Old reason')
    })

    it('should be idempotent when updating with same reason', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies`

      const firstRun = updateBlockedReason(input, '1.1', 'Same reason')
      const secondRun = updateBlockedReason(firstRun, '1.1', 'Same reason')

      expect(firstRun).toBe(secondRun)
    })

    it('should not affect other task sections', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies

#### Task 1.2: Build

- [ ] Create components`

      const result = updateBlockedReason(input, '1.1', 'Blocked')

      expect(result).toContain('**Blocked:** Blocked')
      // Task 1.2 should not have blocked reason
      const task2Section = result.split('#### Task 1.2')[1]
      expect(task2Section).not.toContain('**Blocked:**')
    })

    it('should handle case-insensitive blocked pattern matching', () => {
      const input = `#### Task 1.1: Setup

**blocked:** lowercase blocked

- [ ] Install dependencies`

      const result = updateBlockedReason(input, '1.1', 'Updated')

      expect(result).toContain('**Blocked:** Updated')
      expect(result).not.toContain('lowercase blocked')
    })

    it('should preserve task content structure', () => {
      const input = `#### Task 1.1: Setup

Some description here.

- [ ] Install dependencies
- [ ] Configure environment

More notes.`

      const result = updateBlockedReason(input, '1.1', 'Blocked')

      // Should insert blocked reason right after title
      expect(result).toMatch(/#### Task 1\.1: Setup\n+\*\*Blocked:\*\* Blocked/)
      expect(result).toContain('Some description here.')
      expect(result).toContain('- [ ] Install dependencies')
      expect(result).toContain('More notes.')
    })

    it('should handle empty reason string', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies

**Blocked:** Waiting on API`

      const result = updateBlockedReason(input, '1.1', '')

      expect(result).not.toContain('**Blocked:**')
    })

    it('should handle task with no title match fallback', () => {
      const input = `#### Task 1.1

- [ ] Install dependencies`

      const result = updateBlockedReason(input, '1.1', 'Blocked')

      expect(result).toContain('**Blocked:** Blocked')
    })

    it('should replace only the blocked line content, preserving surrounding text', () => {
      const input = `#### Task 2.1: Test

**Blocked:** old reason here

- [ ] Step one
- [ ] Step two`

      const result = updateBlockedReason(input, '2.1', 'new reason')

      expect(result).toContain('**Blocked:** new reason')
      expect(result).not.toContain('old reason here')
      expect(result).toContain('- [ ] Step one')
      expect(result).toContain('- [ ] Step two')
    })

    it('should handle existing blocked line with extra whitespace before reason', () => {
      const input = `#### Task 2.2: Test

**Blocked:**   lots of space before reason

- [ ] Item`

      const result = updateBlockedReason(input, '2.2', 'fixed')

      expect(result).toContain('**Blocked:** fixed')
      expect(result).not.toContain('lots of space before reason')
    })

    it('should insert blocked line using title match with single newline after title', () => {
      const input = `#### Task 2.3: Single Newline
- [ ] Item`

      const result = updateBlockedReason(input, '2.3', 'reason here')

      expect(result).toContain('**Blocked:** reason here')
      expect(result).toContain('- [ ] Item')
      const blockedIdx = result.indexOf('**Blocked:**')
      const titleIdx = result.indexOf('#### Task 2.3')
      const itemIdx = result.indexOf('- [ ] Item')
      expect(blockedIdx).toBeGreaterThan(titleIdx)
      expect(blockedIdx).toBeLessThan(itemIdx)
    })

    it('should insert blocked line with multiple newlines after title', () => {
      const input = `#### Task 2.4: Multi Newline


- [ ] Item`

      const result = updateBlockedReason(input, '2.4', 'multi-newline reason')

      expect(result).toContain('**Blocked:** multi-newline reason')
      const lines = result.split('\n')
      const titleLineIdx = lines.findIndex((l) => l.includes('#### Task 2.4'))
      const blockedLineIdx = lines.findIndex((l) => l.includes('**Blocked:**'))
      expect(blockedLineIdx).toBeGreaterThan(titleLineIdx)
    })

    it('should insert a blocked line even when the task has no trailing newline after title', () => {
      const input = `#### Task 2.5: No Newline At End`

      const result = updateBlockedReason(input, '2.5', 'should not insert')

      expect(result).toContain('**Blocked:** should not insert')
    })

    it('should correctly replace existing BLOCKED with mixed case via case-insensitive flag', () => {
      const input = `#### Task 2.6: Case Test

**BLOCKED:** UPPERCASE REASON

- [ ] Do stuff`

      const result = updateBlockedReason(input, '2.6', 'replaced')

      expect(result).toContain('**Blocked:** replaced')
      expect(result).not.toContain('UPPERCASE REASON')
      expect(result).not.toContain('**BLOCKED:**')
    })

    it('should match the full blocked line including all reason text', () => {
      const input = `#### Task 2.7: Full Match

**Blocked:** This is a very long reason with special chars

More content below`

      const result = updateBlockedReason(input, '2.7', 'short')

      expect(result).toContain('**Blocked:** short')
      expect(result).not.toContain('very long reason')
      expect(result).toContain('More content below')
    })
  })

  describe('updateTaskStatus', () => {
    it('adds a status line after the task title when missing', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies`

      const result = updateTaskStatus(input, '1.1', 'in_progress')

      expect(result).toContain('**Status:** in_progress')
      expect(result).toMatch(/#### Task 1\.1: Setup\n+\*\*Status:\*\* in_progress/)
    })

    it('updates an existing status line', () => {
      const input = `#### Task 1.1: Setup

**Status:** todo

- [ ] Install dependencies`

      const result = updateTaskStatus(input, '1.1', 'done')

      expect(result).toContain('**Status:** done')
      expect(result).not.toContain('**Status:** todo')
    })

    it('updates lane-prefixed task headings', () => {
      const input = `#### [backend] Task 1.1: Setup

**Status:** todo

- [ ] Install dependencies`

      const result = updateTaskStatus(input, '1.1', 'done')

      expect(result).toContain('#### [backend] Task 1.1: Setup')
      expect(result).toContain('**Status:** done')
      expect(result).not.toContain('**Status:** todo')
    })
  })

  describe('extractTaskSection', () => {
    const sampleMarkdown = `#### Task 1.1: Setup
Implement setup logic

- [ ] Install dependencies

#### Task 1.2: Build

- [ ] Create components

### Phase 2
#### Task 2.1: Integration`

    it('should extract task section by ID', () => {
      const section = extractTaskSection(sampleMarkdown, '1.1')
      expect(section).toContain('#### Task 1.1: Setup')
      expect(section).toContain('Implement setup logic')
      expect(section).toContain('- [ ] Install dependencies')
      expect(section).not.toContain('Task 1.2')
    })

    it('should return null for non-existent task', () => {
      const section = extractTaskSection(sampleMarkdown, '99.99')
      expect(section).toBeNull()
    })

    it('should handle task ID with regex special chars (e.g., 1.1+alpha)', () => {
      const mdWithSpecial = `#### Task 1.1+alpha: Special Version

- [ ] First item

#### Task 1.2: Normal`

      const section = extractTaskSection(mdWithSpecial, '1.1+alpha')
      expect(section).not.toBeNull()
      expect(section).toContain('#### Task 1.1+alpha: Special Version')
      expect(section).toContain('- [ ] First item')
      expect(section).not.toContain('Task 1.2')
    })

    it('should handle task ID with dots (e.g., 1.1)', () => {
      const section = extractTaskSection(sampleMarkdown, '1.1')
      expect(section).not.toBeNull()
      expect(section).toContain('#### Task 1.1: Setup')
    })

    it('should stop at next task header', () => {
      const section = extractTaskSection(sampleMarkdown, '1.1')
      expect(section).not.toBeNull()
      expect(section).not.toContain('#### Task 1.2')
    })

    it('should stop at next phase header', () => {
      const section = extractTaskSection(sampleMarkdown, '1.2')
      expect(section).not.toBeNull()
      expect(section).not.toContain('### Phase 2')
    })

    it('should extract until end of document if last task', () => {
      const section = extractTaskSection(sampleMarkdown, '2.1')
      expect(section).not.toBeNull()
      expect(section).toContain('#### Task 2.1: Integration')
    })

    it('should return exactly null (not empty string) for non-existent task', () => {
      const section = extractTaskSection(sampleMarkdown, '99.99')
      expect(section).toBe(null)
      expect(typeof section).toBe('object')
    })

    it('should trim trailing whitespace from extracted section', () => {
      const mdWithTrailingSpace = `#### Task 3.1: Trailing
Some content here


#### Task 3.2: Next`

      const section = extractTaskSection(mdWithTrailingSpace, '3.1')
      expect(section).not.toBeNull()
      expect(section).toBe(`#### Task 3.1: Trailing\nSome content here`)
      expect(section!.endsWith('here')).toBe(true)
    })

    it('should trim leading whitespace when task header has preceding newlines', () => {
      const mdWithLeading = `Some preamble

#### Task 4.1: Leading
Content`

      const section = extractTaskSection(mdWithLeading, '4.1')
      expect(section).not.toBeNull()
      expect(section).toBe(`#### Task 4.1: Leading\nContent`)
      expect(section!.startsWith('####')).toBe(true)
    })

    it('should stop at #### Task boundary specifically (not other #### headers)', () => {
      const mdWithOtherHeaders = `#### Task 5.1: MyTask
Content line

#### Task 5.2: NextTask
Other content`

      const section = extractTaskSection(mdWithOtherHeaders, '5.1')
      expect(section).not.toBeNull()
      expect(section).toBe(`#### Task 5.1: MyTask\nContent line`)
      expect(section).not.toContain('NextTask')
    })

    it('should stop at ### Phase boundary specifically', () => {
      const mdWithPhase = `#### Task 6.1: BeforePhase
Content before phase

### Phase 3
Phase content`

      const section = extractTaskSection(mdWithPhase, '6.1')
      expect(section).not.toBeNull()
      expect(section).toBe(`#### Task 6.1: BeforePhase\nContent before phase`)
      expect(section).not.toContain('Phase 3')
    })

    it('should not stop at ### non-Phase headers', () => {
      const mdWithOtherH3 = `#### Task 7.1: WithSubheading
Some content

### Random Subheading
More content that belongs to task`

      const section = extractTaskSection(mdWithOtherH3, '7.1')
      expect(section).not.toBeNull()
      // ### Random Subheading is NOT a "### Phase" pattern, so it should NOT stop there
      // Actually the regex is /^(?:####\s+Task|###\s+Phase)/m so ### Random would not match
      expect(section).toContain('### Random Subheading')
      expect(section).toContain('More content that belongs to task')
    })

    it('should extend to end when no next #### Task or ### Phase boundary exists', () => {
      const mdNoNextBoundary = `#### Task 8.1: LastOne
Content here

### Notes
Some notes

## Another level
More stuff`

      const section = extractTaskSection(mdNoNextBoundary, '8.1')
      expect(section).not.toBeNull()
      // Only #### Task and ### Phase are boundaries; ### Notes, ## Another level are not
      expect(section).toContain('### Notes')
      expect(section).toContain('Some notes')
      expect(section).toContain('## Another level')
      expect(section).toContain('More stuff')
    })

    it('should return the section as a string (not undefined or other falsy)', () => {
      const md = `#### Task 9.1: Minimal
Content`

      const section = extractTaskSection(md, '9.1')
      expect(typeof section).toBe('string')
      expect(section!.length).toBeGreaterThan(0)
    })

    it('extracts lane-prefixed task sections', () => {
      const lanePrefixedMarkdown = `#### [backend] Task 1.1: Setup
Implement setup logic

- [ ] Install dependencies

#### [ui] Task 1.2: Build

- [ ] Create components`

      const section = extractTaskSection(lanePrefixedMarkdown, '1.1')

      expect(section).toContain('#### [backend] Task 1.1: Setup')
      expect(section).toContain('Implement setup logic')
      expect(section).not.toContain('Task 1.2')
    })
  })

  describe('extractTaskSection - regex edge cases', () => {
    it('should stop at #### Task with multiple spaces (kills \\s+ to \\s mutation on line 27)', () => {
      // Mutant: /^(?:####\sTask|###\s+Phase)/m - single \s only matches one space
      // This test has TWO spaces between #### and Task in the boundary
      const md = `#### Task 1.1: First
Content first

####  Task 1.2: Second with double space
Content second`

      const section = extractTaskSection(md, '1.1')
      expect(section).not.toBeNull()
      // With \s+ the regex matches "####  Task" (double space), so section stops
      // With \s it would NOT match "####  Task", so section would include everything
      expect(section).not.toContain('Second with double space')
      expect(section).toBe('#### Task 1.1: First\nContent first')
    })

    it('should stop at ### Phase with multiple spaces (kills \\s+ to \\s mutation on line 27)', () => {
      // Mutant: /^(?:####\s+Task|###\sPhase)/m - single \s only matches one space
      const md = `#### Task 2.1: Before
Content before

###  Phase 2
Phase content`

      const section = extractTaskSection(md, '2.1')
      expect(section).not.toBeNull()
      // With \s+ the regex matches "###  Phase" (double space), so section stops
      // With \s it would NOT match, so section would include phase content
      expect(section).not.toContain('Phase content')
      expect(section).toBe('#### Task 2.1: Before\nContent before')
    })

    it('should only match #### Task at line start (kills ^ anchor removal on line 27)', () => {
      // Mutant removes ^ anchor: /(?:####\s+Task|###\s+Phase)/m
      // Without ^, "text #### Task" mid-line would match and split incorrectly
      const md = `#### Task 3.1: Anchor test
Content that mentions #### Task 3.2: inline reference
More content here`

      const section = extractTaskSection(md, '3.1')
      expect(section).not.toBeNull()
      // With ^ anchor, "#### Task 3.2" mid-line does NOT match, so content includes it
      // Without ^ anchor, it WOULD match and split the section
      expect(section).toContain('Content that mentions #### Task 3.2: inline reference')
      expect(section).toContain('More content here')
    })
  })

  describe('updateBlockedReason - regex edge cases', () => {
    it('should replace blocked line with no space after colon (kills \\s* to \\s mutation on line 104)', () => {
      // Mutant: /\*\*Blocked:\*\*\s.+/i - requires at least one whitespace
      // Original: /\*\*Blocked:\*\*\s*.+/i - zero or more whitespace
      const input = `#### Task 4.1: NoSpace
**Blocked:**immediate-reason
- [ ] Task item`

      const result = updateBlockedReason(input, '4.1', 'new reason')
      // With \s* it matches **Blocked:**immediate-reason (zero spaces)
      // With \s it does NOT match, so it tries to add a new blocked line instead
      expect(result).toContain('**Blocked:** new reason')
      // Should NOT have duplicate blocked lines
      expect(result).not.toContain('**Blocked:**immediate-reason')
    })

    it('should handle blocked line with space (kills \\s* to \\S* mutation on line 104)', () => {
      // Mutant: /\*\*Blocked:\*\*\S*.+/i - matches non-whitespace
      // Original: /\*\*Blocked:\*\*\s*.+/i - matches whitespace
      const input = `#### Task 4.2: WithSpace
**Blocked:** existing reason
- [ ] Task item`

      const result = updateBlockedReason(input, '4.2', 'updated')
      // With \s* it matches the space after **Blocked:**
      // With \S* it would NOT match (space is not \S)
      expect(result).toContain('**Blocked:** updated')
      expect(result).not.toContain('existing reason')
    })

    it('should insert blocked after title with multiple spaces (kills \\s+ to \\s on line 108)', () => {
      // Mutant: /(####\sTask\s+[^\n]+\n+)/ or /(####\s+Task\s[^\n]+\n+)/
      // These change \s+ to \s, only matching single space
      const input = `####  Task 5.1:  Spaced Title
- [ ] First item`

      const result = updateBlockedReason(input, '5.1', 'blocked')
      // With \s+ it matches "####  Task" (double space before Task)
      // With \s it would NOT match, so titleMatch is null, section returned unchanged
      expect(result).toContain('**Blocked:** blocked')
    })

    it('should capture all newlines after title (kills \\n+ to \\n on line 108)', () => {
      // Mutant: /(####\s+Task\s+[^\n]+\n)/ - only captures one newline
      // Original: /(####\s+Task\s+[^\n]+\n+)/ - captures all newlines
      const input = `#### Task 6.1: Multi-newline



- [ ] Item after gaps`

      const result = updateBlockedReason(input, '6.1', 'reason')
      // The blocked line should appear after all the newlines from the title match
      // With \n+ the titleMatch captures all 3 newlines
      // With \n it only captures 1, leading to different insertion point
      expect(result).toContain('**Blocked:** reason')
      // Ensure no double blocked lines
      const blockedCount = (result.match(/\*\*Blocked:\*\*/g) ?? []).length
      expect(blockedCount).toBe(1)
    })
  })

  describe('cross-function integration', () => {
    it('should work together: check first, then block, then check all', () => {
      const input = `#### Task 1.1: Setup

- [ ] Install dependencies
- [ ] Configure environment`

      // Step 1: Mark in progress (check first box)
      const inProgress = checkFirstCheckbox(input, '1.1')
      expect(inProgress).toContain('- [x] Install dependencies')
      expect(inProgress).toContain('- [ ] Configure environment')

      // Step 2: Block the task
      const blocked = updateBlockedReason(inProgress, '1.1', 'Need approval')
      expect(blocked).toContain('**Blocked:** Need approval')
      expect(blocked).toContain('- [x] Install dependencies')

      // Step 3: Unblock and complete
      const unblocked = updateBlockedReason(blocked, '1.1', '')
      const completed = checkAllCheckboxes(unblocked, '1.1')
      expect(completed).toContain('- [x] Install dependencies')
      expect(completed).toContain('- [x] Configure environment')
    })
  })
})
