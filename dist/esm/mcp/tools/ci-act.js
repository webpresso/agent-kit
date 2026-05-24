import { resolve } from 'node:path';
import { z } from 'zod';
import { normalizeActSecretsWithOptions, resolveCiActSecretProfile, listMissingRequiredSecrets, pickAllowedSecrets, writeTempSecretsFile, injectDefaultActArgs, } from '#ci/act-helper.js';
import { runSecretGateCommand } from '#secret-gate/runner.js';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { redactText } from './_shared/redact.js';
const inputSchema = z
    .object({
    cwd: z.string().optional(),
    workflowPath: z.string(),
    job: z.string().optional(),
    eventName: z.enum(['pull_request', 'push', 'workflow_dispatch']).optional().default('pull_request'),
    eventPath: z.string().optional(),
    secretProfile: z.enum(['none', 'github-api', 'neon-control-plane']).optional(),
    strictSecrets: z.boolean().optional().default(true),
    mapGithubPatToToken: z.boolean().optional().default(false),
    envProfile: z.string().optional().default('secrets-only'),
    timeoutMs: z.number().int().positive().max(5 * 60_000).optional().default(120_000),
    allowHostMutation: z.boolean().optional().default(false),
    containerArchitecture: z.string().optional(),
    platformImage: z.string().optional().default('ghcr.io/catthehacker/ubuntu:full-latest'),
    passthrough: z.array(z.string()).optional().default([]),
    execute: z.boolean().optional().default(false),
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    counts: z.object({
        secretCount: z.number(),
        missingRequiredCount: z.number(),
    }),
    details: z.object({
        command: z.object({ command: z.string(), args: z.array(z.string()) }),
        profile: z.string(),
        missingRequired: z.array(z.string()),
    }),
});
function buildActCommandArgs(input, secretsPath) {
    const args = [
        input.eventName,
        '-W',
        resolve(input.cwd ?? process.cwd(), input.workflowPath),
        '-P',
        `ubicloud-standard-2=${input.platformImage}`,
        '--secret-file',
        secretsPath,
        '--rm',
    ];
    if (input.job)
        args.push('-j', input.job);
    if (input.eventPath)
        args.push('-e', resolve(input.cwd ?? process.cwd(), input.eventPath));
    if (input.allowHostMutation)
        args.push('--bind');
    if (input.containerArchitecture)
        args.push('--container-architecture', input.containerArchitecture);
    if (input.passthrough.length > 0)
        args.push(...input.passthrough);
    return injectDefaultActArgs(args);
}
function buildPayload(input, missingRequired, secretCount) {
    return {
        passed: false,
        summary: `ci-act missing required secrets for profile ${resolveCiActSecretProfile({
            workflowPath: input.workflowPath,
            jobName: input.job,
            explicitProfileId: input.secretProfile,
        }).id}`,
        counts: {
            secretCount,
            missingRequiredCount: missingRequired.length,
        },
        details: {
            command: { command: 'act', args: [] },
            profile: resolveCiActSecretProfile({
                workflowPath: input.workflowPath,
                jobName: input.job,
                explicitProfileId: input.secretProfile,
            }).id,
            missingRequired,
        },
    };
}
const tool = {
    name: 'wp_ci_act',
    description: 'Run local GitHub Actions workflows through `act` via the public secret-gate contract (`with-secrets --env-profile ...`).',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'CI act',
        destructiveHint: false,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const profile = resolveCiActSecretProfile({
            workflowPath: input.workflowPath,
            jobName: input.job,
            explicitProfileId: input.secretProfile,
        });
        const secrets = normalizeActSecretsWithOptions([pickAllowedSecrets(process.env, profile.allowedKeys)], { mapGithubPatToToken: input.mapGithubPatToToken });
        const missingRequired = listMissingRequiredSecrets(secrets, profile.requiredKeys);
        if (input.strictSecrets && missingRequired.length > 0) {
            return createSummaryResult(buildPayload(input, missingRequired, Object.keys(secrets).length), {
                isError: true,
            });
        }
        const temp = writeTempSecretsFile(secrets);
        try {
            const actArgs = buildActCommandArgs(input, temp.path);
            if (!input.execute) {
                return createSummaryResult({
                    passed: true,
                    summary: `ci-act dry-run prepared for profile ${profile.id}`,
                    counts: {
                        secretCount: Object.keys(secrets).length,
                        missingRequiredCount: missingRequired.length,
                    },
                    details: {
                        command: { command: 'act', args: actArgs },
                        profile: profile.id,
                        missingRequired,
                    },
                });
            }
            const result = await runSecretGateCommand({
                cwd: input.cwd,
                envProfile: input.envProfile,
                command: 'act',
                args: actArgs,
                timeoutMs: input.timeoutMs,
                signal: extra?.signal,
            });
            const merged = [result.stdout, result.stderr].filter(Boolean).join('\n');
            const redacted = redactText(merged);
            return createSummaryResult({
                passed: result.exitCode === 0,
                summary: result.exitCode === 0
                    ? `ci-act finished successfully via profile ${profile.id}`
                    : `ci-act failed with exit ${result.exitCode} via profile ${profile.id}`,
                exitCode: result.exitCode,
                counts: {
                    secretCount: Object.keys(secrets).length,
                    missingRequiredCount: missingRequired.length,
                },
                details: {
                    command: { command: 'act', args: actArgs },
                    profile: profile.id,
                    missingRequired,
                },
                rawOutput: redacted,
                ...(result.timedOut ? { failures: [{ message: 'timed out while running act' }] } : {}),
                ...(result.aborted ? { failures: [{ message: 'aborted by client signal' }] } : {}),
            });
        }
        finally {
            temp.cleanup();
        }
    },
};
export default tool;
//# sourceMappingURL=ci-act.js.map