/**
 * `ak cursor-windsurf-sync` — copy skills/*.md to .cursor/rules/ and .windsurf/skills/
 *
 * Fallback distribution path for Cursor and Windsurf when localskills.sh
 * registration format is unverified. Directly copies catalog skills from
 * the package's catalog directory into the IDE-native paths at the repo root.
 *
 * This is the primary-IDE distribution channel: run once after `ak setup`
 * to push all agent-kit skills into Cursor and Windsurf's native skill paths.
 */
import type { CAC } from 'cac';
export declare function registerCursorWindsurfSyncCommand(cli: CAC): void;
//# sourceMappingURL=cursor-windsurf-sync.d.ts.map