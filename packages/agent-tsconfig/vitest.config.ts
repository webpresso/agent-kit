import type { ViteUserConfig } from 'vite-plus/test/config'

import { nodeConfig } from '@webpresso/vitest-config/node'
import { mergeConfig } from 'vite-plus/test/config'

export default mergeConfig(nodeConfig as ViteUserConfig, {
  test: {
    environment: 'node',
    globals: true,
    include: ['*.test.ts'],
    name: 'typescript-config',
  },
})
