import type { RunnerEvent } from "#runners/types";

// ---------------------------------------------------------------------------
// assertEval3 — verifies the test-addition eval outcome
//
// Checks:
//   1. Has a 'completed' event with exitCode 0
//   2. At least one stdout/progress event mentioning 'test' or 'multiply'
// ---------------------------------------------------------------------------

export interface AssertResult {
  readonly passed: boolean;
  readonly reason?: string;
}

export async function assertEval3(events: readonly RunnerEvent[]): Promise<AssertResult> {
  const completedEvent = events.find(
    (e): e is Extract<RunnerEvent, { type: "completed" }> => e.type === "completed",
  );

  if (completedEvent === undefined) {
    return { passed: false, reason: "no 'completed' event found in event stream" };
  }

  if (completedEvent.exitCode !== 0) {
    return {
      passed: false,
      reason: `'completed' event has exitCode ${completedEvent.exitCode}, expected 0`,
    };
  }

  const mentionsTestOrMultiply = events.some((e) => {
    if (e.type === "stdout") {
      return e.line.toLowerCase().includes("test") || e.line.toLowerCase().includes("multiply");
    }
    if (e.type === "progress") {
      return (
        e.message.toLowerCase().includes("test") || e.message.toLowerCase().includes("multiply")
      );
    }
    return false;
  });

  if (!mentionsTestOrMultiply) {
    return {
      passed: false,
      reason: "no stdout or progress event mentions 'test' or 'multiply'",
    };
  }

  return { passed: true };
}
