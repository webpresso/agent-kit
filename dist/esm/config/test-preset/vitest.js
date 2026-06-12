export function defineTestPreset(options = {}) {
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
    };
}
export function createNodeTestPreset(options = {}) {
    return defineTestPreset({
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        environment: 'node',
        globals: true,
        restoreMocks: true,
        ...options,
    });
}
//# sourceMappingURL=vitest.js.map