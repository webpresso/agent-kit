/**
 * Interfaces for dependency injection and testability.
 *
 * These interfaces allow mocking of external dependencies (filesystem, time)
 * for deterministic testing.
 */
/**
 * Default clock using Date.now()
 */
export const realClock = {
    now: () => Date.now(),
};
//# sourceMappingURL=interfaces.js.map