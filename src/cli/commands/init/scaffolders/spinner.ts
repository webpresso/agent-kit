/**
 * DI-injectable spinner abstraction for scaffolders.
 *
 * Real usage: ora (TTY) or noop (non-TTY / CI).
 * Test usage: inject a noop factory to track calls via vi.fn().
 */

export type Spinner = {
  start(): void
  succeed(text?: string): void
  fail(text?: string): void
}

export type SpinnerFactory = (text: string) => Spinner

const noopSpinner: Spinner = {
  start() {},
  succeed() {},
  fail() {},
}

function noopFactory(_text: string): Spinner {
  return noopSpinner
}

/**
 * Returns the default spinner factory for the current environment.
 * - Non-TTY (CI): always noop — no ANSI escape codes emitted.
 * - TTY: ora-backed spinner.
 */
export async function defaultSpinnerFactory(): Promise<SpinnerFactory> {
  if (!process.stdout.isTTY) return noopFactory
  const { default: ora } = await import('ora')
  return (text: string) => ora(text).start() as Spinner
}

/**
 * Synchronous noop factory — safe for injection in tests and non-TTY paths.
 */
export function makeNoopSpinnerFactory(): SpinnerFactory {
  return noopFactory
}
