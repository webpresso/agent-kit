import { vi } from 'vitest';
import { _setSyncAdapterFactory } from './blueprint-server.js';
import { callTool, cleanupTempDir, createTempBlueprintRepo, markBlueprintValidated, registerBlueprintToolMap, writeBlueprintFixture, trustDossierFixture, } from './blueprint-server.test-harness.js';
const TASK_VERIFICATION_BLOCK = `**Verification:**

\`\`\`webpresso-evidence-v1
[{"command":"wp_test --files src/mcp/blueprint-server.platform-first.lifecycle.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T12:00:00.000Z"}]
\`\`\``;
export async function makePlatformHarness(prefix = 'wp-bs-platform-test-') {
    const tmpDir = createTempBlueprintRepo(prefix);
    const tools = await registerBlueprintToolMap(tmpDir);
    return { tmpDir, tools };
}
export async function makePlatformBlueprintHarness(options) {
    const tmpDir = createTempBlueprintRepo(options.prefix);
    const { overviewPath } = writeBlueprintFixture(tmpDir, {
        stateDir: options.stateDir,
        slug: options.slug,
        content: options.content,
    });
    const tools = await registerBlueprintToolMap(tmpDir);
    if (options.validate) {
        await callTool(tools, 'wp_blueprint_validate', { path: overviewPath });
        markBlueprintValidated(tmpDir, options.slug);
    }
    return { tmpDir, overviewPath, tools };
}
export function installMockSyncAdapter() {
    const pushEvent = vi.fn().mockResolvedValue(undefined);
    const ensureFresh = vi.fn().mockResolvedValue(undefined);
    _setSyncAdapterFactory(() => ({ pushEvent, ensureFresh }));
    return { pushEvent, ensureFresh };
}
export function installNullSyncAdapter() {
    _setSyncAdapterFactory(() => null);
}
export function resetPlatformFirstTestState(tempDirs) {
    _setSyncAdapterFactory(null);
    vi.unstubAllEnvs();
    for (const dir of tempDirs) {
        cleanupTempDir(dir);
    }
}
export const ADVANCE_BLUEPRINT = `---
type: blueprint
title: Advance Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship advance feature
- **Consuming surface:** /advance route
- **New user-visible capability:** Users can advance tasks.

## Summary

Blueprint used to test task advance.

#### Task 1.1: The advance task

**Status:** todo
**Wave:** 0
**Files:**
- src/foo.ts

**Acceptance:**
- [ ] The task is advanced
`;
export const PROMOTE_BLUEPRINT = `---
type: blueprint
title: Promote Test Blueprint
status: draft
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship promote feature
- **Consuming surface:** /promote route
- **New user-visible capability:** Users can promote blueprints.

## Summary

Blueprint used to test promote.

#### Task 1.1: The promote task

**Status:** todo
**Wave:** 0

**Acceptance:**
- [ ] The blueprint is promoted
${trustDossierFixture()}
`;
export const FINALIZE_BLUEPRINT = `---
type: blueprint
title: Finalize Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship finalize feature
- **Consuming surface:** /finalize route
- **New user-visible capability:** Users can finalize blueprints.

## Summary

Blueprint used to test finalize.

#### Task 1.1: The finalize task

**Status:** done
**Wave:** 0
${TASK_VERIFICATION_BLOCK}

**Acceptance:**
- [x] The blueprint is finalized
`;
export const FINALIZE_BLUEPRINT_UNVERIFIED = `---
type: blueprint
title: Finalize Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — ship finalize feature
- **Consuming surface:** /finalize route
- **New user-visible capability:** Users can finalize blueprints.

## Summary

Blueprint used to test finalize rejection without verification.

#### Task 1.1: The finalize task

**Status:** done
**Wave:** 0

**Acceptance:**
- [x] The blueprint is finalized
`;
export const PROMOTE_TO_COMPLETED_BLUEPRINT = `---
type: blueprint
title: Promote Completed Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — complete promote feature
- **Consuming surface:** /promote route
- **New user-visible capability:** Users can promote blueprints to completed.

## Summary

Blueprint used to test completed promotion.

#### Task 1.1: The promote task

**Status:** done
**Wave:** 0
${TASK_VERIFICATION_BLOCK}

**Acceptance:**
- [x] The blueprint is promoted
`;
export const PROMOTE_TO_COMPLETED_BLUEPRINT_UNVERIFIED = `---
type: blueprint
title: Promote Completed Test Blueprint
status: in-progress
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

## Product wedge anchor

- **Stage outcome:** Phase 1 — complete promote feature
- **Consuming surface:** /promote route
- **New user-visible capability:** Users can promote blueprints to completed.

## Summary

Blueprint used to test completed promotion rejection without verification.

#### Task 1.1: The promote task

**Status:** done
**Wave:** 0

**Acceptance:**
- [x] The blueprint is promoted
`;
//# sourceMappingURL=blueprint-server.platform-first.test-harness.js.map