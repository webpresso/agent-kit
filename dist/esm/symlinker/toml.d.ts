/**
 * Gemini CLI TOML writer.
 *
 * Gemini's command surface lives under `.gemini/commands/*.toml`, not markdown.
 * Rather than symlinking, we transform `.agent/commands/*.md` and
 * `.agent/workflows/*.md` sources into TOML and write them out. This module
 * owns the TOML shape; the `$ARGUMENTS` → `{{args}}` substitution is applied
 * by the caller before passing the `prompt` string in.
 */
export declare function toToml(description: string, prompt: string): string;
//# sourceMappingURL=toml.d.ts.map