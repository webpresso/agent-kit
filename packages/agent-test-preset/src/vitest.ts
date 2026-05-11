export interface TestPresetOptions {
  name?: string
  include?: string[]
  exclude?: string[]
  environment?: 'node' | 'happy-dom' | 'jsdom' | 'edge-runtime'
  globals?: boolean
  restoreMocks?: boolean
  coverage?: boolean
}

export interface DefineConfigCompatible {
  test?: {
    name?: string
    include?: string[]
    exclude?: string[]
    environment?: string
    globals?: boolean
    restoreMocks?: boolean
    coverage?: {
      provider: 'v8' | 'istanbul'
      reporter: string[]
    }
  }
}

export function defineTestPreset(options: TestPresetOptions = {}): DefineConfigCompatible {
  return {
    test: {
      name: options.name,
      include: options.include,
      exclude: options.exclude,
      environment: options.environment,
      globals: options.globals,
      restoreMocks: options.restoreMocks,
      ...(options.coverage
        ? {
            coverage: {
              provider: 'v8',
              reporter: ['text', 'json', 'html', 'lcov'],
            },
          }
        : {}),
    },
  }
}

export function createNodeTestPreset(options: TestPresetOptions = {}): DefineConfigCompatible {
  return defineTestPreset({
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'node',
    globals: true,
    restoreMocks: true,
    ...options,
  })
}
