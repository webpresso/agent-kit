export async function runAuditDispatch(auditKind, targets, options, deps) {
    if (!auditKind) {
        return { kind: 'invalid-usage', message: 'No audit kind provided.' };
    }
    const target = targets[0];
    // Repo-level registry dispatch (catalog-drift, blueprint-lifecycle, etc.)
    if (deps.knownRepoKinds.includes(auditKind)) {
        const root = options.root ?? target ?? deps.root;
        const result = await deps.runRepoAudit(auditKind, root, options);
        return { kind: 'repo-result', name: auditKind, result };
    }
    const forwarded = [];
    if (options.fix)
        forwarded.push('--fix');
    if (options.json)
        forwarded.push('--json');
    if (target)
        forwarded.push(target);
    switch (auditKind) {
        case 'tph': {
            const { runTphAudit } = await import('#audit/audit-tph-runner');
            const root = options.root ?? target ?? deps.root;
            const result = await runTphAudit(root);
            return {
                kind: 'repo-result',
                name: 'tph',
                result: {
                    ok: result.errorCount === 0,
                    title: 'Testing Philosophy Audit (TPH)',
                    checked: result.filesChecked,
                    violations: result.violations.map((v) => ({
                        message: `[${v.rule}] ${v.message}`,
                        file: v.file,
                    })),
                },
            };
        }
        case 'tph-e2e': {
            const { runTphE2eAudit } = await import('#audit/audit-tph-e2e-runner');
            const root = options.root ?? target ?? deps.root;
            const result = await runTphE2eAudit(root);
            return {
                kind: 'repo-result',
                name: 'tph-e2e',
                result: {
                    ok: result.errorCount === 0,
                    title: 'Testing Philosophy Audit (TPH) - E2E',
                    checked: result.filesChecked,
                    violations: result.violations.map((v) => ({
                        message: `[${v.rule}] ${v.message}`,
                        file: v.file,
                    })),
                },
            };
        }
        case 'bundle-budget': {
            const args = deps.buildBundleBudgetArgs(target, options);
            const code = await deps.runBundleBudget(args);
            return { kind: 'script-exit', code };
        }
        case 'commit-message': {
            const messageFile = options.messageFile ?? target;
            if (!messageFile) {
                return {
                    kind: 'invalid-usage',
                    message: 'commit-message requires a message file target or --message-file <file>.',
                };
            }
            const result = await deps.runCommitMessageAudit(messageFile, options);
            return { kind: 'repo-result', name: 'commit-message', result };
        }
        case 'mutation': {
            const cwd = options.root ?? target ?? deps.root;
            const code = await deps.runStryker(cwd);
            return { kind: 'script-exit', code };
        }
        case 'guardrails': {
            const root = options.root ?? target ?? deps.root;
            // Run every known repo audit kind and aggregate
            const results = [];
            let allOk = true;
            for (const name of deps.knownRepoKinds) {
                const result = await deps.runRepoAudit(name, root, options);
                if (!result.ok)
                    allOk = false;
                results.push({ name, result });
            }
            // Surface every per-audit result so the shell can print failures —
            // previously this returned a bare `script-exit` and `wp audit guardrails`
            // would exit 1 with zero output, hiding the actual cause from the
            // pre-commit hook output.
            return { kind: 'aggregate-result', code: allOk ? 0 : 1, results };
        }
        case 'quality': {
            const root = options.root ?? target ?? deps.root;
            const mutationCode = await deps.runStryker(root);
            // Run guardrails sequentially after mutation
            let guardrailsOk = true;
            for (const name of deps.knownRepoKinds) {
                const result = await deps.runRepoAudit(name, root, options);
                if (!result.ok)
                    guardrailsOk = false;
            }
            const guardrailsCode = guardrailsOk ? 0 : 1;
            const code = mutationCode !== 0 ? mutationCode : guardrailsCode;
            return { kind: 'quality-exit', code, mutationCode, guardrailsCode };
        }
        case 'secrets-policy': {
            const { auditSecretsPolicy } = await import('#audit/secrets-policy');
            const root = options.root ?? target ?? deps.root;
            const result = auditSecretsPolicy(root);
            return { kind: 'repo-result', name: 'secrets-policy', result };
        }
        case 'no-dev-vars': {
            const { auditNoDevVars } = await import('#audit/no-dev-vars');
            const root = options.root ?? target ?? deps.root;
            const result = auditNoDevVars(root);
            return { kind: 'repo-result', name: 'no-dev-vars', result };
        }
        case 'secret-provider-quarantine': {
            const { auditSecretProviderQuarantine } = await import('#audit/secret-provider-quarantine');
            const root = options.root ?? target ?? deps.root;
            const result = auditSecretProviderQuarantine(root);
            return { kind: 'repo-result', name: 'secret-provider-quarantine', result };
        }
        case 'secrets-config': {
            const { auditSecretsConfig } = await import('#audit/secrets-config');
            const root = options.root ?? target ?? deps.root;
            const result = auditSecretsConfig(root);
            return { kind: 'repo-result', name: 'secrets-config', result };
        }
        default: {
            return { kind: 'unknown-kind', auditKind };
        }
    }
}
//# sourceMappingURL=audit-core.js.map