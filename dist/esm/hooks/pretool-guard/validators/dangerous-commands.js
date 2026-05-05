import { getCommand, isBashInput } from '#hooks/shared/types';
import { createSkipResult } from './skip-result.js';
export const VALIDATOR_NAME = 'dangerous-commands';
const DANGEROUS_PATTERNS = [
    { pattern: /\bgit\s+push\s+.*--force\b/, description: 'git push --force can overwrite remote history' },
    { pattern: /\bgit\s+push\s+-f\b/, description: 'git push -f can overwrite remote history' },
    {
        pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+\/(?:\s|$)/,
        description: 'rm -rf / is catastrophically destructive',
    },
    {
        pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\b.*--force|-[a-zA-Z]*f[a-zA-Z]*r)\s+~(?:\s|$|\/\s)/,
        description: 'rm -rf ~ deletes entire home directory',
    },
    { pattern: /\bgit\s+reset\s+--hard\b/, description: 'git reset --hard discards uncommitted changes' },
    { pattern: /\bgit\s+clean\s+.*-f/, description: 'git clean -f deletes untracked files permanently' },
    { pattern: /\bmkfs\b/, description: 'mkfs formats filesystems' },
    { pattern: /\bdd\s+.*of=\/dev\//, description: 'dd to device can overwrite disk' },
    // Secret-to-disk patterns. See `.agent/rules/agent-guide.md` §
    // "Environment Variables & Secret Injection". Source-of-truth tools
    // (gh, op, doppler, aws sts, gcloud, az, vault, kubectl) are fast enough
    // that no plaintext cache is justified — even at user-level paths.
    {
        pattern: /\b(?:gh\s+auth\s+token|op\s+read|doppler\s+secrets\s+get|aws\s+sts\s+get-(?:session-token|caller-identity)|gcloud\s+auth\s+print-(?:access|identity)-token|az\s+account\s+get-access-token|vault\s+kv\s+get|kubectl\s+get\s+secret)\b[^|<&]*[>]\s*\S/,
        description: 'redirecting a secret-source command into a file persists credentials to disk — never cache secrets (see .agent/rules/agent-guide.md)',
    },
    {
        pattern: /\b(?:gh\s+auth\s+token|op\s+read|doppler\s+secrets\s+get|aws\s+sts\s+get-(?:session-token|caller-identity)|gcloud\s+auth\s+print-(?:access|identity)-token|az\s+account\s+get-access-token|vault\s+kv\s+get|kubectl\s+get\s+secret)\b[^|]*\|\s*(?:tee|sponge|dd\s+of=)/,
        description: 'piping a secret-source command through tee/sponge/dd persists credentials to disk — never cache secrets',
    },
    {
        pattern: /\b(?:echo|printf)\b[^>]*\$\{?(?:GH_PACKAGES_TOKEN|GITHUB_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|DOPPLER_TOKEN|DATABASE_URL|GEMINI_API_KEY|GOOGLE_API_KEY|AWS_(?:SECRET_)?ACCESS_KEY(?:_ID)?)\}?[^>]*>>?\s*\S/,
        description: 'redirecting a secret env var (echo/printf) to a file persists credentials to disk — never cache secrets',
    },
];
export function validateDangerousCommands(input) {
    if (process.env.DANGEROUS_COMMANDS_SKIP === '1')
        return createSkipResult(VALIDATOR_NAME);
    if (!isBashInput(input))
        return createSkipResult(VALIDATOR_NAME, 'Not a Bash command');
    const command = getCommand(input);
    if (!command)
        return { validator: VALIDATOR_NAME, passed: true };
    for (const { pattern, description } of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
            return { validator: VALIDATOR_NAME, passed: false, message: `"${command}" → ${description}` };
        }
    }
    return { validator: VALIDATOR_NAME, passed: true };
}
//# sourceMappingURL=dangerous-commands.js.map