import { createNodeProjects, nodeConfig } from '@webpresso/agent-vitest/node'
import { mergeConfig } from 'vite-plus/test/config'

// Add CLI shell exclusions to the base exclude list
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseExclude = (nodeConfig as any).test?.coverage?.exclude ?? []
const hasCliShells = baseExclude.some((pattern: string) => pattern.includes('src/cli'))

// @ts-expect-error -- cross-package vitest version mismatch requires type escape
export default mergeConfig(nodeConfig, {
  test: {
    projects: [
      ...createNodeProjects('docs-linter'),
      {
        test: {
          name: 'docs-linter/isolation',
          include: ['export-isolation.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      exclude: [
        ...baseExclude,
        // Thin CLI shells (by design untestable - ~50 lines each)
        ...(hasCliShells
          ? []
          : [
              'src/cli/validate.ts',
              'src/cli/migrate.ts',
              'src/cli/check-refs.ts',
              'src/cli/check-stale.ts',
              'src/cli/check-internal-links.ts',
            ]),
        // CLI entry points and batch scripts (thin wrappers)
        'src/batch-fix-code-blocks.ts',
        // Type-only schema definitions (no runtime logic to test)
        'src/schemas/draft.ts',
        'src/schemas/ongoing-initiative.ts',
        'src/schemas/parent-roadmap.ts',
        // Type-only files (no runtime code)
        'src/types.ts',
        'src/cli/interfaces.ts',
      ],
    },
  },
})
