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
export declare const __reactSetupModule = true;
//# sourceMappingURL=react-setup.d.ts.map