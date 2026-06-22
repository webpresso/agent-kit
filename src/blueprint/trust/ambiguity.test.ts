import { describe, expect, it } from 'vitest'
import { parseTrustDossier } from './dossier.js'
import { validateTrustAmbiguity } from './ambiguity.js'
import { VALID_DOSSIER } from './test-fixtures.js'

describe('validateTrustAmbiguity', () => {
  it('rejects executable ambiguity and residual unknowns other than None', () => {
    const dossier = parseTrustDossier(VALID_DOSSIER.replace('None.', 'Unknown.')).dossier!
    expect(validateTrustAmbiguity(dossier).length).toBeGreaterThan(0)
  })

  it('rejects unresolved ambiguity in executable task sections when markdown is provided', () => {
    const dossier = parseTrustDossier(VALID_DOSSIER).dossier!
    const markdown = `${VALID_DOSSIER}
#### Task 1.1: Ship it
**Acceptance:**
- [ ] TODO decide during implementation
`
    expect(validateTrustAmbiguity(dossier, markdown).some((v) => v.section === 'Tasks')).toBe(true)
  })
})
