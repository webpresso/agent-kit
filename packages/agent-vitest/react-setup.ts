/**
 * Global Vitest setup for React tests
 * Configures React act() environment for React 19
 *
 * React 18+ checks globalThis.IS_REACT_ACT_ENVIRONMENT to detect test environment.
 * @testing-library/react sets it, but React may check before it's set.
 * This explicitly enables it for all React tests.
 *
 * React version: 19.2.1
 * See: https://react.dev/blog/2022/03/08/react-18-upgrade-guide
 */

// Set IS_REACT_ACT_ENVIRONMENT to true for test environment
// This tells React 18+ that we're in a test environment and act() warnings should work correctly
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Suppress console output globally for clean test output
 * This prevents stderr/stdout noise from error handling tests
 */
const noop = () => {
  // Intentionally empty - suppresses console output
}
global.console.error = noop
global.console.warn = noop
global.console.log = noop

export const __reactSetupModule = true
