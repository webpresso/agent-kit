import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      { find: 'bun:sqlite', replacement: resolve(__dirname, 'src/__mocks__/bun-sqlite.ts') },
      // Subpath imports map: "#utils/*" → src/blueprint/utils/*
      // This mirrors the package.json `"imports": { "#*": "./src/blueprint/*.ts" }` mapping
      // so that vitest can resolve internal imports like `#utils/blueprint-root.js`.
      { find: /^#db\/(.*)/, replacement: resolve(__dirname, 'src/blueprint/db/$1') },
      { find: /^#utils\/(.*)/, replacement: resolve(__dirname, 'src/blueprint/utils/$1') },
      { find: /^#local/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      { find: /^#index/, replacement: resolve(__dirname, 'src/blueprint/index.ts') },
      { find: /^#paths\/(.*)/, replacement: resolve(__dirname, 'src/paths/$1') },
      { find: /^#cli\/(.*)/, replacement: resolve(__dirname, 'src/cli/$1') },
      { find: /^#dev\/(.*)/, replacement: resolve(__dirname, 'src/dev/$1') },
      { find: /^#audit\/(.*)/, replacement: resolve(__dirname, 'src/audit/$1') },
      { find: /^#docs-linter\/(.*)/, replacement: resolve(__dirname, 'src/docs-linter/$1') },
      { find: /^#hooks\/(.*)/, replacement: resolve(__dirname, 'src/hooks/$1') },
      { find: /^#mcp\/(.*)/, replacement: resolve(__dirname, 'src/mcp/$1') },
      { find: /^#content\/(.*)/, replacement: resolve(__dirname, 'src/content/$1') },
      {
        find: /^#output-transforms\/(.*)/,
        replacement: resolve(__dirname, 'src/output-transforms/$1'),
      },
      { find: /^#lint\/(.*)/, replacement: resolve(__dirname, 'src/lint/$1') },
      { find: /^#format\/(.*)/, replacement: resolve(__dirname, 'src/format/$1') },
      { find: /^#symlinker\/(.*)/, replacement: resolve(__dirname, 'src/symlinker/$1') },
      { find: /^#symlinker/, replacement: resolve(__dirname, 'src/symlinker/index.ts') },
      { find: /^#compiler\/(.*)/, replacement: resolve(__dirname, 'src/compiler/$1') },
      { find: /^#telemetry\/(.*)/, replacement: resolve(__dirname, 'src/telemetry/$1') },
      { find: /^#quality-engine$/, replacement: resolve(__dirname, 'src/quality-engine/index.ts') },
      { find: /^#quality-engine\/(.*)/, replacement: resolve(__dirname, 'src/quality-engine/$1') },
      {
        find: /^#ai-memory\/checkpoint\/(.*)/,
        replacement: resolve(__dirname, 'src/ai-memory/checkpoint/$1'),
      },
      {
        find: /^#ai-memory\/facts\/(.*)/,
        replacement: resolve(__dirname, 'src/ai-memory/facts/$1'),
      },
      {
        find: /^#ai-memory\/hierarchy\/(.*)/,
        replacement: resolve(__dirname, 'src/ai-memory/hierarchy/$1'),
      },
      // Explicit sync aliases — must precede the #* catch-all to avoid doubling the path
      {
        find: /^#blueprint\/sync\/types\.js$/,
        replacement: resolve(__dirname, 'src/blueprint/sync/types.ts'),
      },
      {
        find: /^#blueprint\/sync\/auth\.js$/,
        replacement: resolve(__dirname, 'src/blueprint/sync/auth.ts'),
      },
      {
        find: /^#blueprint\/sync\/client\.js$/,
        replacement: resolve(__dirname, 'src/blueprint/sync/client.ts'),
      },
      { find: /^#test/, replacement: resolve(__dirname, 'src/test/index.ts') },
      { find: /^#e2e$/, replacement: resolve(__dirname, 'src/e2e/index.ts') },
      { find: /^#e2e\/(.*)/, replacement: resolve(__dirname, 'src/e2e/$1') },
      // Fallback: remaining "#*" maps to src/blueprint/*
      { find: /^#(.*)/, replacement: resolve(__dirname, 'src/blueprint/$1') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: false,
    testTimeout: 10_000,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})
