/**
 * `ak symlink sync|check` — re-sync .agents/skills/ and .gemini/commands/
 * from the canonical .agent/ tree (Codex, Amp, and Gemini CLI only).
 *
 * Primary IDEs (Claude Code, Cursor, Windsurf, OpenCode) distribute skills
 * via native channels and are no longer managed by the symlinker.
 *
 * Thin wrapper around `syncAll` from the symlinker module. `check` runs the
 * same logic as `sync` and exits non-zero if any drift was repaired —
 * suitable as a CI gate that reports "commit these changes".
 *
 * Flags:
 *   --primary-ides   Only run the primary-IDE path (Cursor/Windsurf via
 *                    `ak cursor-windsurf-sync`). Skips Codex/Amp/Gemini.
 *   --tail-ides      Only run the tail-IDE symlinker path (Codex, Amp,
 *                    Gemini). Skips Cursor/Windsurf direct-copy.
 *   (no flags)       Run both paths — equivalent to passing both flags.
 */
import type { CAC } from 'cac';
export declare function registerSymlinkCommand(cli: CAC): void;
//# sourceMappingURL=symlink.d.ts.map