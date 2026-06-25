import { describe, expect, it } from "vitest";

import { buildContinuityEvent, buildPromptContinuityEvents } from "./hook-capture.js";

describe("hook continuity capture helpers", () => {
  it("builds byte-capped pure typed events without shelling out", () => {
    const event = buildContinuityEvent({
      eventType: "tool_edit",
      toolName: "Edit",
      content: "edited src/session-memory/session.ts ".repeat(30),
      maxContentBytes: 96,
      metadata: { path: "src/session-memory/session.ts" },
    });

    expect(event.eventType).toBe("tool_edit");
    expect(Buffer.byteLength(event.content, "utf8")).toBeLessThanOrEqual(96);
    expect(event.summary).toContain("edited src/session-memory/session.ts");
    expect(event.metadata).toMatchObject({ path: "src/session-memory/session.ts" });
    expect(event.metadata?.truncated).toBe(true);
  });

  it("derives prompt, decision, and constraint events from explicit prompt annotations", () => {
    const events = buildPromptContinuityEvents({
      prompt: [
        "Implement session continuity.",
        "Decision: keep SQLite as the only continuity store.",
        "Constraint: do not add telemetry.",
      ].join("\\n"),
      maxContentBytes: 256,
    });

    expect(events.map((event) => event.eventType)).toStrictEqual([
      "user_prompt",
      "decision",
      "constraint",
    ]);
    expect(events[1]?.content).toBe("keep SQLite as the only continuity store.");
    expect(events[2]?.content).toBe("do not add telemetry.");
  });
});
