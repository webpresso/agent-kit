/**
 * DI-injectable spinner abstraction for scaffolders.
 *
 * Real usage: ora (TTY) or noop (non-TTY / CI).
 * Test usage: inject a noop factory to track calls via vi.fn().
 */
const noopSpinner = {
    start() { },
    succeed() { },
    fail() { },
};
function noopFactory(_text) {
    return noopSpinner;
}
/**
 * Returns the default spinner factory for the current environment.
 * - Non-TTY (CI): always noop — no ANSI escape codes emitted.
 * - TTY: ora-backed spinner.
 */
export async function defaultSpinnerFactory() {
    if (!process.stdout.isTTY)
        return noopFactory;
    const { default: ora } = await import('ora');
    return (text) => ora(text).start();
}
/**
 * Synchronous noop factory — safe for injection in tests and non-TTY paths.
 */
export function makeNoopSpinnerFactory() {
    return noopFactory;
}
//# sourceMappingURL=spinner.js.map