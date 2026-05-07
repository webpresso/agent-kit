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
            const script = deps.resolveScript('audit-tph.ts');
            const code = await deps.runScript(script, forwarded);
            return { kind: 'script-exit', code };
        }
        case 'tph-e2e': {
            const script = deps.resolveScript('audit-tph-e2e.ts');
            const code = await deps.runScript(script, forwarded);
            return { kind: 'script-exit', code };
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
            let allOk = true;
            let lastResult = null;
            for (const name of deps.knownRepoKinds) {
                const result = await deps.runRepoAudit(name, root, options);
                if (!result.ok)
                    allOk = false;
                lastResult = result;
            }
            // Return aggregated exit code as script-exit so shell can map it
            const code = allOk ? 0 : 1;
            if (lastResult) {
                return { kind: 'script-exit', code };
            }
            return { kind: 'script-exit', code };
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
        default: {
            return { kind: 'unknown-kind', auditKind };
        }
    }
}
//# sourceMappingURL=audit-core.js.map