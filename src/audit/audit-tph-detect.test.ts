import { describe, expect, it } from 'vitest'

import { type Violation, detectTphViolations } from './audit-tph-detect.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CLEAN_FILE = {
  path: 'src/components/Button.test.ts',
  contents: `
    import { render } from '@testing-library/react'
    describe('Button', () => {
      it('renders correctly', () => { render(<Button />) })
    })
  `,
}

const OVER_MOCKED_FILE = {
  path: 'src/components/App.test.ts',
  contents: `
    vi.mock('@third-party/service-a')
    vi.mock('@third-party/service-b')
    vi.mock('@third-party/service-c')
    vi.mock('@third-party/service-d')
    describe('App', () => { it('works', () => { /* real assertion */ }) })
  `,
}

const INTERNAL_MOCK_UNIT_FILE = {
  path: 'src/features/auth.test.ts', // .test.ts — NOT .integration.test.ts
  contents: `
    vi.mock('@myorg/auth-service', () => ({ signIn: vi.fn() }))
    describe('auth', () => { it('signs in', () => { /* assertion */ }) })
  `,
}

const ALLOWLISTED_MOCK_UNIT_FILE = {
  path: 'src/features/ui.test.ts',
  contents: `
    vi.mock('@myorg/ui')
    describe('ui', () => { it('renders', () => { /* assertion */ }) })
  `,
}

const INTEGRATION_MOCK_FILE = {
  path: 'src/features/auth.integration.test.ts', // .integration.test.ts — mocks allowed
  contents: `
    vi.mock('@myorg/auth-service', () => ({ signIn: vi.fn() }))
    describe('auth integration', () => { it('signs in', () => { /* assertion */ }) })
  `,
}

const INLINE_YAML_FILE = {
  path: 'src/utils/yaml.test.ts',
  contents: `
    import { writeFileSync } from 'node:fs'
    it('writes yaml', () => {
      writeFileSync('output.yaml', \`name: test\nvalue: 123\`)
    })
  `,
}

const INFRA_TAGGED_MOCK_FILE = {
  path: 'src/features/worker.test.ts',
  contents: `
    // [TPH-INFRA] Worker runtime not available in unit tests
    vi.mock('@myorg/auth-service')
    describe('worker', () => { it('runs', () => { /* assertion */ }) })
  `,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('detectTphViolations', () => {
  it('returns 0 violations for a clean file', () => {
    const result = detectTphViolations([CLEAN_FILE])

    expect(result.filesChecked).toBe(1)
    expect(result.violations).toHaveLength(0)
    expect(result.errorCount).toBe(0)
    expect(result.warningCount).toBe(0)
    expect(result.infoCount).toBe(0)
  })

  it('returns over-mocking WARNING when non-infra mock count exceeds maxMocks', () => {
    const result = detectTphViolations([OVER_MOCKED_FILE], { maxMocks: 3 })

    const overMockViolation = result.violations.find((v: Violation) => v.rule === 'over-mocking')
    expect(overMockViolation).not.toBe(undefined)
    expect(overMockViolation?.severity).toBe('WARNING')
    expect(result.warningCount).toBeGreaterThanOrEqual(1)
  })

  it('does NOT flag over-mocking when count is at or below maxMocks', () => {
    // 4 mocks, maxMocks=4 — exactly at threshold, no violation
    const result = detectTphViolations([OVER_MOCKED_FILE], { maxMocks: 4 })

    const overMockViolation = result.violations.find((v: Violation) => v.rule === 'over-mocking')
    expect(overMockViolation).toBe(undefined)
  })

  it('returns service-mock-in-unit-test ERROR for internal mock in .test.ts', () => {
    const result = detectTphViolations([INTERNAL_MOCK_UNIT_FILE])

    const violation = result.violations.find(
      (v: Violation) => v.rule === 'service-mock-in-unit-test',
    )
    expect(violation).not.toBe(undefined)
    expect(violation?.severity).toBe('ERROR')
    expect(result.errorCount).toBeGreaterThanOrEqual(1)
  })

  it('does NOT flag internal mock in .integration.test.ts', () => {
    const result = detectTphViolations([INTEGRATION_MOCK_FILE])

    const violation = result.violations.find(
      (v: Violation) => v.rule === 'service-mock-in-unit-test',
    )
    expect(violation).toBe(undefined)
    expect(result.errorCount).toBe(0)
  })

  it('does NOT flag allowlisted @myorg/* mock as service mock', () => {
    const result = detectTphViolations([ALLOWLISTED_MOCK_UNIT_FILE])

    const serviceViolation = result.violations.find(
      (v: Violation) => v.rule === 'service-mock-in-unit-test',
    )
    expect(serviceViolation).toBe(undefined)
    expect(result.errorCount).toBe(0)
  })

  it('does NOT flag [TPH-INFRA]-tagged mock as service mock', () => {
    const result = detectTphViolations([INFRA_TAGGED_MOCK_FILE])

    const serviceViolation = result.violations.find(
      (v: Violation) => v.rule === 'service-mock-in-unit-test',
    )
    expect(serviceViolation).toBe(undefined)
  })

  it('returns inline-yaml ERROR for multiline YAML string in writeFileSync', () => {
    const result = detectTphViolations([INLINE_YAML_FILE])

    const violation = result.violations.find((v: Violation) => v.rule === 'inline-yaml')
    expect(violation).not.toBe(undefined)
    expect(violation?.severity).toBe('ERROR')
  })

  it('counts filesChecked across multiple inputs', () => {
    const result = detectTphViolations([CLEAN_FILE, OVER_MOCKED_FILE, INTEGRATION_MOCK_FILE])

    expect(result.filesChecked).toBe(3)
  })

  it('aggregates violations from multiple files', () => {
    const result = detectTphViolations([INTERNAL_MOCK_UNIT_FILE, OVER_MOCKED_FILE], { maxMocks: 3 })

    expect(result.violations.length).toBeGreaterThan(0)
    const files = new Set(result.violations.map((v: Violation) => v.file))
    expect(files.size).toBeGreaterThanOrEqual(2)
  })

  it('returns empty result for empty file list', () => {
    const result = detectTphViolations([])

    expect(result.filesChecked).toBe(0)
    expect(result.violations).toHaveLength(0)
    expect(result.errorCount).toBe(0)
    expect(result.warningCount).toBe(0)
    expect(result.infoCount).toBe(0)
  })

  it.each([
    {
      label: 'clean file',
      file: CLEAN_FILE,
      maxMocks: 3,
      expectedErrors: 0,
      expectedWarnings: 0,
    },
    {
      label: 'over-mocked (4 mocks, maxMocks=3)',
      file: OVER_MOCKED_FILE,
      maxMocks: 3,
      expectedErrors: 0,
      expectedWarnings: 1,
    },
    {
      label: 'internal service mock in unit test',
      file: INTERNAL_MOCK_UNIT_FILE,
      maxMocks: 3,
      expectedErrors: 1,
      expectedWarnings: 0,
    },
    {
      label: 'allowlisted infra mock in unit test',
      file: ALLOWLISTED_MOCK_UNIT_FILE,
      maxMocks: 3,
      expectedErrors: 0,
      expectedWarnings: 0,
    },
    {
      label: 'internal mock in integration test — no violation',
      file: INTEGRATION_MOCK_FILE,
      maxMocks: 3,
      expectedErrors: 0,
      expectedWarnings: 0,
    },
  ])('table-driven: $label', ({ file, maxMocks, expectedErrors, expectedWarnings }) => {
    const result = detectTphViolations([file], { maxMocks })

    expect(result.errorCount).toBe(expectedErrors)
    expect(result.warningCount).toBe(expectedWarnings)
  })
})
