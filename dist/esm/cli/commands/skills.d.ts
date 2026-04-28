/**
 * `ak skills list|install` — manage agent skills against the
 * bundled catalog at `<packageRoot>/catalog/agent/skills/`.
 *
 *   list                        Enumerate bundled catalog skills.
 *   list --installed            Enumerate skills present at <cwd>/.agent/skills.
 *   install <name>              Copy a catalog skill into <cwd>/.agent/skills.
 *
 * The bundled catalog ships inside this package's `catalog/` directory and
 * is enumerated lazily — empty catalog is reported, not an error.
 */
import type { CAC } from 'cac';
export declare function registerSkillsCommand(cli: CAC): void;
//# sourceMappingURL=skills.d.ts.map