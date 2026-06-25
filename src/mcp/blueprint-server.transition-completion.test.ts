import { describe, expect, it } from "vitest";

import {
  callTool,
  cleanupTempDir,
  makeProjectionBackedBlueprintHarness,
  parseResult,
  trustDossierFixture,
} from "./blueprint-server.test-harness.js";

const TRANSITION_DROPPED_SLUG = "transition-dropped-blueprint";

const TRANSITION_DROPPED_BLUEPRINT = `---
type: blueprint
title: Transition Dropped Blueprint
status: draft
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — prove transition behavior
- **Consuming surface:** /transition route
- **New user-visible capability:** Users can transition blueprints safely.

## Summary

Blueprint used to test dropped-task completion.

#### Task 1.1: Dropped task

**Status:** dropped
**Wave:** 0

**Acceptance:**
- [ ] Dropped work does not block completion
${trustDossierFixture()}
`;

describe("wp_blueprint_transition — completion", () => {
  it("allows transitioning to completed when all remaining tasks are dropped", async () => {
    const harness = await makeProjectionBackedBlueprintHarness("wp-bs-transition-dropped-", [
      { stateDir: "draft", slug: TRANSITION_DROPPED_SLUG, content: TRANSITION_DROPPED_BLUEPRINT },
    ]);
    try {
      const getResult = await callTool(harness.tools, "wp_blueprint_get", {
        project_id: harness.tmpDir,
        slug: TRANSITION_DROPPED_SLUG,
      });
      const before = parseResult<{ content_hash: string }>(getResult);

      const result = await callTool(harness.tools, "wp_blueprint_transition", {
        project_id: harness.tmpDir,
        slug: TRANSITION_DROPPED_SLUG,
        to_state: "completed",
        expected_version: before.content_hash,
      });

      expect(result.isError).toStrictEqual(false);
      const data = parseResult<{ new_status: string; status: string; failures: string[] }>(result);
      expect(data.new_status).toBe("completed");
      expect(data.status).toBe("completed");
      expect(data.failures).toStrictEqual([]);
    } finally {
      cleanupTempDir(harness.tmpDir);
    }
  });
});
