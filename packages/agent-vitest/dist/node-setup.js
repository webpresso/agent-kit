/**
 * Global Vitest setup for Node.js tests
 * Suppresses console output for clean test runs
 */
/**
 * Suppress console output globally for clean test output
 * This prevents stderr/stdout noise from error handling tests
 */
const noop = () => {
    // Intentionally empty - suppresses console output
};
global.console.error = noop;
global.console.warn = noop;
global.console.log = noop;
export const __nodeSetupModule = true;
