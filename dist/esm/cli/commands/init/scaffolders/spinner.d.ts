/**
 * DI-injectable spinner abstraction for scaffolders.
 *
 * Real usage: ora (TTY) or noop (non-TTY / CI).
 * Test usage: inject a noop factory to track calls via vi.fn().
 */
export type Spinner = {
    start(): void;
    succeed(text?: string): void;
    fail(text?: string): void;
};
export type SpinnerFactory = (text: string) => Spinner;
/**
 * Returns the default spinner factory for the current environment.
 * - Non-TTY (CI): always noop — no ANSI escape codes emitted.
 * - TTY: ora-backed spinner.
 */
export declare function defaultSpinnerFactory(): Promise<SpinnerFactory>;
/**
 * Synchronous noop factory — safe for injection in tests and non-TTY paths.
 */
export declare function makeNoopSpinnerFactory(): SpinnerFactory;
//# sourceMappingURL=spinner.d.ts.map