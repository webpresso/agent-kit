import { describe, expect, it } from 'vitest'

import { diffDocTemplateMirror } from './sync-catalog-doc-templates.js'

describe('catalog doc-template mirror', () => {
  it('catalog/docs/templates/ is byte-identical to the docs/templates/ source of truth', () => {
    // docs/templates/ is editable canonical; catalog/docs/templates/ is the
    // published + scaffolded mirror. They must never silently diverge — run
    // `bun src/build/sync-catalog-doc-templates.ts` when this fails.
    expect(diffDocTemplateMirror()).toStrictEqual([])
  })
})
