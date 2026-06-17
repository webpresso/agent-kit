import { vi } from 'vitest';
import type { SyncAdapter } from './blueprint-server.js';
import { type ToolMap } from './blueprint-server.test-harness.js';
export interface PlatformHarness {
    readonly tmpDir: string;
    readonly tools: ToolMap;
}
export interface PlatformBlueprintHarness extends PlatformHarness {
    readonly overviewPath: string;
}
export declare function makePlatformHarness(prefix?: string): Promise<PlatformHarness>;
export declare function makePlatformBlueprintHarness(options: {
    readonly prefix: string;
    readonly stateDir: string;
    readonly slug: string;
    readonly content: string;
    readonly validate?: boolean;
}): Promise<PlatformBlueprintHarness>;
export declare function installMockSyncAdapter(): {
    readonly pushEvent: ReturnType<typeof vi.fn<SyncAdapter['pushEvent']>>;
    readonly ensureFresh: ReturnType<typeof vi.fn<SyncAdapter['ensureFresh']>>;
};
export declare function installNullSyncAdapter(): void;
export declare function resetPlatformFirstTestState(tempDirs: readonly string[]): void;
export declare const ADVANCE_BLUEPRINT = "---\ntype: blueprint\ntitle: Advance Test Blueprint\nstatus: in-progress\ncomplexity: S\nowner: tester\ncreated: '2026-01-01'\nlast_updated: '2026-05-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** Phase 1 \u2014 ship advance feature\n- **Consuming surface:** /advance route\n- **New user-visible capability:** Users can advance tasks.\n\n## Summary\n\nBlueprint used to test task advance.\n\n#### Task 1.1: The advance task\n\n**Status:** todo\n**Wave:** 0\n**Files:**\n- src/foo.ts\n\n**Acceptance:**\n- [ ] The task is advanced\n";
export declare const PROMOTE_BLUEPRINT = "---\ntype: blueprint\ntitle: Promote Test Blueprint\nstatus: draft\ncomplexity: S\nowner: tester\ncreated: '2026-01-01'\nlast_updated: '2026-05-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** Phase 1 \u2014 ship promote feature\n- **Consuming surface:** /promote route\n- **New user-visible capability:** Users can promote blueprints.\n\n## Summary\n\nBlueprint used to test promote.\n\n#### Task 1.1: The promote task\n\n**Status:** todo\n**Wave:** 0\n\n**Acceptance:**\n- [ ] The blueprint is promoted\n";
export declare const FINALIZE_BLUEPRINT = "---\ntype: blueprint\ntitle: Finalize Test Blueprint\nstatus: in-progress\ncomplexity: S\nowner: tester\ncreated: '2026-01-01'\nlast_updated: '2026-05-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** Phase 1 \u2014 ship finalize feature\n- **Consuming surface:** /finalize route\n- **New user-visible capability:** Users can finalize blueprints.\n\n## Summary\n\nBlueprint used to test finalize.\n\n#### Task 1.1: The finalize task\n\n**Status:** done\n**Wave:** 0\n**Verification:**\n\n```webpresso-evidence-v1\n[{\"command\":\"wp_test --files src/mcp/blueprint-server.platform-first.lifecycle.test.ts\",\"exit_code\":0,\"kind\":\"test\",\"result\":\"pass\",\"ts\":\"2026-05-28T12:00:00.000Z\"}]\n```\n\n**Acceptance:**\n- [x] The blueprint is finalized\n";
export declare const FINALIZE_BLUEPRINT_UNVERIFIED = "---\ntype: blueprint\ntitle: Finalize Test Blueprint\nstatus: in-progress\ncomplexity: S\nowner: tester\ncreated: '2026-01-01'\nlast_updated: '2026-05-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** Phase 1 \u2014 ship finalize feature\n- **Consuming surface:** /finalize route\n- **New user-visible capability:** Users can finalize blueprints.\n\n## Summary\n\nBlueprint used to test finalize rejection without verification.\n\n#### Task 1.1: The finalize task\n\n**Status:** done\n**Wave:** 0\n\n**Acceptance:**\n- [x] The blueprint is finalized\n";
export declare const PROMOTE_TO_COMPLETED_BLUEPRINT = "---\ntype: blueprint\ntitle: Promote Completed Test Blueprint\nstatus: in-progress\ncomplexity: S\nowner: tester\ncreated: '2026-01-01'\nlast_updated: '2026-05-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** Phase 1 \u2014 complete promote feature\n- **Consuming surface:** /promote route\n- **New user-visible capability:** Users can promote blueprints to completed.\n\n## Summary\n\nBlueprint used to test completed promotion.\n\n#### Task 1.1: The promote task\n\n**Status:** done\n**Wave:** 0\n**Verification:**\n\n```webpresso-evidence-v1\n[{\"command\":\"wp_test --files src/mcp/blueprint-server.platform-first.lifecycle.test.ts\",\"exit_code\":0,\"kind\":\"test\",\"result\":\"pass\",\"ts\":\"2026-05-28T12:00:00.000Z\"}]\n```\n\n**Acceptance:**\n- [x] The blueprint is promoted\n";
export declare const PROMOTE_TO_COMPLETED_BLUEPRINT_UNVERIFIED = "---\ntype: blueprint\ntitle: Promote Completed Test Blueprint\nstatus: in-progress\ncomplexity: S\nowner: tester\ncreated: '2026-01-01'\nlast_updated: '2026-05-01'\n---\n\n## Product wedge anchor\n\n- **Stage outcome:** Phase 1 \u2014 complete promote feature\n- **Consuming surface:** /promote route\n- **New user-visible capability:** Users can promote blueprints to completed.\n\n## Summary\n\nBlueprint used to test completed promotion rejection without verification.\n\n#### Task 1.1: The promote task\n\n**Status:** done\n**Wave:** 0\n\n**Acceptance:**\n- [x] The blueprint is promoted\n";
//# sourceMappingURL=blueprint-server.platform-first.test-harness.d.ts.map