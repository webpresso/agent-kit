import { describe, expect, it } from 'vitest'

import { hardcodedRepoRootDepth } from './monorepo-paths.js'

/**
 * Regression coverage for the `no-hardcoded-repo-root` matcher. The previous
 * implementation only caught the multi-argument form at 4+ arguments, so
 * `join(import.meta.dirname, '..', '..')` (two separate '..' args, depth 2)
 * silently passed in production code. `hardcodedRepoRootDepth` unifies the
 * single-literal and multi-argument forms into one depth count.
 *
 * The matcher inspects only `args[1..]` (the anchor at args[0] is never read),
 * so a minimal stand-in anchor node is sufficient.
 */
type LiteralNode = { readonly type: 'Literal'; readonly value: string }
type AnchorNode = { readonly type: 'MemberExpression' }
type IdentifierNode = { readonly type: 'Identifier'; readonly name: string }

const lit = (value: string): LiteralNode => ({ type: 'Literal', value })
const anchor: AnchorNode = { type: 'MemberExpression' }

describe('hardcodedRepoRootDepth', () => {
  it('flags two separate ".." args — the form that previously needed 4+ args', () => {
    expect(hardcodedRepoRootDepth([anchor, lit('..'), lit('..')])).toStrictEqual({
      depth: 2,
      index: 1,
    })
  })

  it('flags a single combined "../.." literal', () => {
    expect(hardcodedRepoRootDepth([anchor, lit('../..')])).toStrictEqual({ depth: 2, index: 1 })
  })

  it('flags three "../" segments across separate args', () => {
    expect(hardcodedRepoRootDepth([anchor, lit('..'), lit('..'), lit('..')])).toStrictEqual({
      depth: 3,
      index: 1,
    })
  })

  it('points at the first traversal arg when a directory segment precedes it', () => {
    expect(hardcodedRepoRootDepth([anchor, lit('pkg'), lit('..'), lit('..')])).toStrictEqual({
      depth: 2,
      index: 2,
    })
  })

  it('does not flag a single ".." — one level up is not a repo-root climb', () => {
    expect(hardcodedRepoRootDepth([anchor, lit('..')])).toStrictEqual(null)
  })

  it('does not flag one ".." plus a directory segment (depth 1)', () => {
    expect(hardcodedRepoRootDepth([anchor, lit('..'), lit('foo')])).toStrictEqual(null)
  })

  it('does not flag paths with no parent traversal', () => {
    expect(hardcodedRepoRootDepth([anchor, lit('src'), lit('index.ts')])).toStrictEqual(null)
  })

  it('ignores non-literal arguments when summing traversal depth', () => {
    const identifier: IdentifierNode = { type: 'Identifier', name: 'segment' }
    expect(hardcodedRepoRootDepth([anchor, lit('..'), identifier, lit('..')])).toStrictEqual({
      depth: 2,
      index: 1,
    })
  })
})
