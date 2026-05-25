import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vite-plus/test/config', () => ({
  defineConfig: (config: unknown) => config,
}))

vi.mock('@vitejs/plugin-react', () => ({
  default: () => ({ name: 'vite:react' }),
}))

const ROOT = process.cwd()

type ModuleExports = Record<string, unknown>

const configModules = [
  { file: 'node.ts', exports: ['nodeConfig', 'createNodeProjects'] },
  { file: 'react.ts', exports: ['reactConfig'] },
  { file: 'react-router.ts', exports: ['reactRouterConfig'] },
  { file: 'workers.ts', exports: ['workersConfig'] },
  { file: 'webpresso-node.ts', exports: ['webpressoNodeConfig', 'createWebpressoNodeProjects'] },
  { file: 'webpresso-react.ts', exports: ['webpressoReactConfig'] },
  { file: 'webpresso-react-router.ts', exports: ['webpressoReactRouterConfig'] },
  { file: 'webpresso-workers.ts', exports: ['webpressoWorkersConfig'] },
]

const helperModules = [
  { file: 'flakiness-reporter.ts', exports: ['createFlakinessReporter'] },
  { file: 'version-guard.ts', exports: ['assertVitest4', 'assertNonWorkersVitest4'] },
]

const configExpectations = {
  'node.ts': { exports: ['nodeConfig', 'createNodeProjects'], environment: 'node' },
  'react.ts': { exports: ['reactConfig'], environment: 'happy-dom' },
  'react-router.ts': { exports: ['reactRouterConfig'], environment: 'happy-dom' },
  'workers.ts': { exports: ['workersConfig'], environment: undefined },
  'webpresso-node.ts': {
    exports: ['webpressoNodeConfig', 'createWebpressoNodeProjects'],
    environment: 'node',
  },
  'webpresso-react.ts': { exports: ['webpressoReactConfig'], environment: 'happy-dom' },
  'webpresso-react-router.ts': {
    exports: ['webpressoReactRouterConfig'],
    environment: 'happy-dom',
  },
  'webpresso-workers.ts': { exports: ['webpressoWorkersConfig'], environment: undefined },
} as const

async function importLocal(file: string): Promise<ModuleExports> {
  return import(pathToFileURL(join(ROOT, 'src/config/vitest', file)).href) as Promise<ModuleExports>
}

function normalize(value: unknown): unknown {
  if (typeof value === 'function') return `[Function:${value.name || 'anonymous'}]`
  if (typeof value === 'string') {
    return value
      .replaceAll('/src/config/vitest/', '/<vitest-root>/')
      .replaceAll(`/packages/${'agent-vitest'}/`, '/<vitest-root>/')
  }
  if (value instanceof RegExp) return value.toString()
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      key === 'plugins' ? '[plugins]' : normalize(child),
    ]),
  )
}

describe('folded vitest config parity', () => {
  it.each(configModules)('exports the canonical config surface for $file', async ({ file }) => {
    const local = await importLocal(file)
    const expected = configExpectations[file as keyof typeof configExpectations]

    for (const exportName of expected.exports) {
      expect(local).toHaveProperty(exportName)
      expect(local[exportName]).toBeDefined()
    }

    const firstExport = local[expected.exports[0] as keyof typeof local] as {
      test?: { environment?: string }
    }
    if (expected.environment !== undefined) {
      expect(normalize(firstExport.test?.environment)).toEqual(expected.environment)
    }
  })

  it.each(helperModules)('keeps helper export surface for $file', async ({ file, exports }) => {
    const local = await importLocal(file)

    for (const exportName of exports) {
      expect(local).toHaveProperty(exportName)
      expect(typeof local[exportName]).toBe('function')
    }
  })

  it('preserves setup module markers', async () => {
    await expect(importLocal('node-setup.ts')).resolves.toHaveProperty('__nodeSetupModule', true)
    await expect(importLocal('react-setup.ts')).resolves.toHaveProperty('__reactSetupModule', true)
  })

  it('keeps folded runtime files local to src/config/vitest', () => {
    const foldedFiles = [
      'node.ts',
      'react.ts',
      'react-router.ts',
      'workers.ts',
      'react-setup.ts',
      'flakiness-reporter.ts',
      'version-guard.ts',
      'webpresso-node.ts',
      'webpresso-react.ts',
      'webpresso-react-router.ts',
      'webpresso-workers.ts',
    ]

    for (const file of foldedFiles) {
      const source = readFileSync(join(ROOT, 'src/config/vitest', file), 'utf8')
      expect(source).not.toContain(`packages/${'agent-vitest'}`)
      expect(source).not.toMatch(/from\s+['"]\.\.\//)
      expect(source).not.toMatch(/import\(['"]\.\.\//)
    }
  })
})
