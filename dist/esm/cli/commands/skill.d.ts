/**
 * `wp skill <new|list|show|deprecate|install|uninstall>` — thin shim over
 * shared content dispatch with two extra registry actions:
 *
 *   install <name>     — adds <name> to .webpressorc.json#installed.tier3Skills
 *                        (the skill must exist in the bundled catalog).
 *                        Idempotent. Registry-only edit; no copy.
 *   uninstall <name>   — removes <name> from the registry. Idempotent.
 *
 * `wp skills` (plural) was renamed to `wp skill` (singular) in 0.4.0. The
 * old plural is wired separately as a hidden helpful-error stub (see cli.ts).
 */
import type { CAC } from "cac";
export declare function registerSkillCommand(cli: CAC): void;
/**
 * Hidden stub for the renamed `wp skills` (plural). cac will still match
 * the command, but we just emit a helpful redirect and exit 1.
 */
export declare function registerSkillsRenameStub(cli: CAC): void;
//# sourceMappingURL=skill.d.ts.map