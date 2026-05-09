/**
 * Gemini CLI TOML writer.
 *
 * Gemini's command surface lives under `.gemini/commands/*.toml`, not markdown.
 * Rather than symlinking, we transform `.agent/commands/*.md` and
 * `.agent/workflows/*.md` sources into TOML and write them out. This module
 * owns the TOML shape; the `$ARGUMENTS` → `{{args}}` substitution is applied
 * by the caller before passing the `prompt` string in.
 */
export function toToml(description, prompt) {
    const escapedDesc = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    // In TOML multiline basic strings ("""), escape backslashes and sequences of 3+ quotes
    const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"');
    return `description = "${escapedDesc}"\n\nprompt = """\n${escapedPrompt}\n"""\n`;
}
//# sourceMappingURL=toml.js.map