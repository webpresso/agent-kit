import { nodeConfig } from '@webpresso/agent-vitest/node'
import { mergeConfig } from 'vite-plus/test/config'

export default mergeConfig(
  // @ts-expect-error -- cross-package vitest version mismatch requires type escape
  nodeConfig,
  {
    test: {
      include: ['*.test.ts'],
      name: 'vitest-config',
    },
  },
)
