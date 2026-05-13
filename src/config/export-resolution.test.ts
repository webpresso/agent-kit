import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

const requiredSubpaths = [
  'webpresso/tsconfig/base.json',
  'webpresso/vitest/node',
  'webpresso/stryker',
  'webpresso/oxlint',
  'webpresso/workers-test',
  'webpresso/docs-lint',
  'webpresso/launch',
  'webpresso/test-preset',
  'webpresso/e2e-preset',
] as const

const exportSourceTargets: Record<string, string> = {
  './tsconfig/base.json': './src/config/tsconfig/base.json',
  './tsconfig/cloudflare.json': './src/config/tsconfig/cloudflare.json',
  './tsconfig/library.json': './src/config/tsconfig/library.json',
  './tsconfig/react-library.json': './src/config/tsconfig/react-library.json',
  './tsconfig/react-router.json': './src/config/tsconfig/react-router.json',
  './tsconfig/webpresso.json': './src/config/tsconfig/webpresso.json',
  './tsconfig/webpresso': './src/config/tsconfig/webpresso.json',
  './vitest/node': './src/config/vitest/node.ts',
  './vitest/react': './src/config/vitest/react.ts',
  './vitest/react-router': './src/config/vitest/react-router.ts',
  './vitest/workers': './src/config/vitest/workers.ts',
  './vitest/react-setup': './src/config/vitest/react-setup.ts',
  './vitest/react-setup.ts': './src/config/vitest/react-setup.ts',
  './vitest/flakiness-reporter': './src/config/vitest/flakiness-reporter.ts',
  './vitest/webpresso/node': './src/config/vitest/webpresso-node.ts',
  './vitest/webpresso/react': './src/config/vitest/webpresso-react.ts',
  './vitest/webpresso/react-router': './src/config/vitest/webpresso-react-router.ts',
  './vitest/webpresso/workers': './src/config/vitest/webpresso-workers.ts',
  './stryker': './src/config/stryker/index.ts',
  './stryker/webpresso': './src/config/stryker/webpresso.ts',
  './oxlint': './src/config/oxlint/index.ts',
  './oxlint/import-hygiene': './src/config/oxlint/import-hygiene.ts',
  './oxlint/monorepo-paths': './src/config/oxlint/monorepo-paths.ts',
  './oxlint/foundation-purity': './src/config/oxlint/foundation-purity.ts',
  './oxlint/tier-boundaries': './src/config/oxlint/tier-boundaries.ts',
  './oxlint/query-patterns': './src/config/oxlint/query-patterns.ts',
  './oxlint/graphql-conventions': './src/config/oxlint/graphql-conventions.ts',
  './oxlint/testing-quality': './src/config/oxlint/testing-quality.ts',
  './oxlint/code-safety': './src/config/oxlint/code-safety.ts',
  './workers-test': './src/config/workers-test/index.ts',
  './docs-lint': './src/config/docs-lint/index.ts',
  './docs-lint/schemas': './src/config/docs-lint/schemas/index.ts',
  './docs-lint/generator': './src/config/docs-lint/generator/index.ts',
  './launch': './src/config/launch/index.ts',
  './test-preset': './src/config/test-preset/index.ts',
  './test-preset/vitest': './src/config/test-preset/vitest.ts',
  './e2e-preset': './src/config/e2e-preset/index.ts',
  './e2e-preset/playwright': './src/config/e2e-preset/playwright.ts',
}

const docsLintBins = {
  'docs-check-internal-links': './src/config/docs-lint/cli/check-internal-links.ts',
  'docs-check-refs': './src/config/docs-lint/cli/check-refs.ts',
  'docs-check-stale': './src/config/docs-lint/cli/check-stale.ts',
  'docs-lint': './src/config/docs-lint/cli/validate.ts',
  'docs-migrate': './src/config/docs-lint/cli/migrate.ts',
} as const

type PackageJson = {
  bin?: Record<string, string>
  exports?: Record<string, unknown>
  files?: string[]
  tshy?: { exports?: Record<string, string> }
}

async function readCanonicalPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as PackageJson
}

function exportedDefaultTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined

  const importValue = (value as { import?: unknown }).import
  if (!importValue || typeof importValue !== 'object') return undefined

  return (importValue as { default?: string }).default
}

async function buildStagingPackageJson(canonical: PackageJson): Promise<PackageJson> {
  const scriptModule = (await import(
    pathToFileURL(join(repositoryRoot, 'scripts/publish-webpresso.ts')).href
  )) as {
    buildStagingPackageJson: (canonical: PackageJson) => PackageJson
  }

  return scriptModule.buildStagingPackageJson(canonical)
}

describe('webpresso folded package exports', () => {
  it('maps every folded subpath from source exports to public package exports', async () => {
    const packageJson = await readCanonicalPackageJson()

    for (const [subpath, sourceTarget] of Object.entries(exportSourceTargets)) {
      expect(packageJson.tshy?.exports?.[subpath]).toBe(sourceTarget)
      expect(packageJson.exports).toHaveProperty(subpath)
      expect(
        exportedDefaultTarget(packageJson.exports?.[subpath]) ?? packageJson.exports?.[subpath],
      ).toBeDefined()
    }

    expect(packageJson.files).toContain('src')
  })

  it('maps tsconfig package exports directly to physical json files for TypeScript extends', async () => {
    const packageJson = await readCanonicalPackageJson()

    expect(packageJson.exports?.['./tsconfig/webpresso.json']).toBe('./tsconfig/webpresso.json')
    expect(packageJson.exports?.['./tsconfig/webpresso']).toBe('./tsconfig/webpresso.json')
  })

  it('keeps hook bins and wires folded docs-lint bins to local entrypoints', async () => {
    const packageJson = await readCanonicalPackageJson()

    expect(packageJson.bin).toMatchObject({
      wp: './src/cli/cli.ts',
      webpresso: './src/cli/cli.ts',
      ak: './src/cli/cli.ts',
      'ak-pretool-guard': './src/hooks/pretool-guard/index.ts',
      ...docsLintBins,
    })
  })

  it('resolves key public subpaths through the staged webpresso package manifest', async () => {
    const packageJson = await readCanonicalPackageJson()
    const stagingPackageJson = await buildStagingPackageJson(packageJson)
    const tempDir = await mkdtemp(join(tmpdir(), 'webpresso-export-resolution-'))
    const packageDir = join(tempDir, 'node_modules', 'webpresso')

    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), JSON.stringify(stagingPackageJson), 'utf8')

    try {
      const output = execFileSync(
        'node',
        [
          '--input-type=module',
          '--eval',
          `for (const specifier of ${JSON.stringify(requiredSubpaths)}) console.log(specifier + ' => ' + import.meta.resolve(specifier))`,
        ],
        { cwd: tempDir, encoding: 'utf8' },
      )

      for (const subpath of requiredSubpaths) {
        expect(output).toContain(`${subpath} => file://`)
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps folded docs-lint bins in the staged webpresso package manifest', async () => {
    const packageJson = await readCanonicalPackageJson()
    const stagingPackageJson = await buildStagingPackageJson(packageJson)

    expect(stagingPackageJson.bin).toMatchObject(docsLintBins)
  })
})
