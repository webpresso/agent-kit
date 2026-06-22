import { describe, expect, it } from 'vitest'
import { parseTrustDossier } from './dossier.js'
import { validateTrustAmbiguity } from './ambiguity.js'
import { VALID_DOSSIER } from './test-fixtures.js'

describe('validateTrustAmbiguity', () => {
  it('rejects executable ambiguity and residual unknowns other than None', () => {
    const dossier = parseTrustDossier(VALID_DOSSIER.replace('None.', 'Unknown.')).dossier!
    expect(validateTrustAmbiguity(dossier).length).toBeGreaterThan(0)
  })
})
