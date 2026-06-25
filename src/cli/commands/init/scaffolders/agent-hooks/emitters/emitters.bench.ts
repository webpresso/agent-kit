/**
 * Emitter performance gate — ensures buildClaudeHookGroups and
 * buildCodexHookGroups complete within acceptable time bounds.
 *
 * vitest 4.x supports bench(); this file uses it.
 */

import { bench, describe } from "vitest";

import { buildClaudeHookGroups } from "./claude.js";
import { buildCodexHookGroups } from "./codex.js";

const TEST_MATCHERS = {
  preToolUse: "Bash|Write|Edit",
  postToolUse: "Bash|Write|Edit",
} as const;

describe("emitter performance", () => {
  bench(
    "buildClaudeHookGroups 1000x",
    () => {
      buildClaudeHookGroups({
        resolveBin: (name) => `/repo/node_modules/.bin/${name}`,
        matchers: TEST_MATCHERS,
      });
    },
    { iterations: 1000 },
  );

  bench(
    "buildCodexHookGroups 1000x",
    () => {
      buildCodexHookGroups({
        resolveBin: (repoRoot) => (name) => `${repoRoot}/node_modules/.bin/${name}`,
        matchers: TEST_MATCHERS,
        repoRoot: "/repo",
      });
    },
    { iterations: 1000 },
  );
});
