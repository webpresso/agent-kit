import { resolve } from 'node:path';
import { isWebpressoOwnedCodexHook } from './codex-ownership.js';
export async function syncCodexHookTrustWithAppServer(api, input) {
    const expectedSourcePaths = normalizeExpectedSourcePaths(input);
    const hookDescription = input.hookDescription ?? 'webpresso-owned';
    const selectHook = input.selectHook ?? isWebpressoOwnedCodexHook;
    let firstList;
    try {
        firstList = await api.hooksList([input.repoRoot]);
    }
    catch (error) {
        return failure('hooks-list-failed', error);
    }
    const ownedHooks = collectOwnedHooks(firstList, expectedSourcePaths, selectHook);
    if (ownedHooks.length === 0) {
        return {
            ok: false,
            reason: 'no-webpresso-hooks-found',
            message: `No ${hookDescription} Codex hooks found for ${input.repoRoot}`,
        };
    }
    const state = buildCodexTrustStateUpdate(ownedHooks);
    try {
        await api.configBatchWrite({
            edits: [{ keyPath: 'hooks.state', value: state, mergeStrategy: 'upsert' }],
            reloadUserConfig: true,
        });
    }
    catch (error) {
        return failure('config-write-failed', error);
    }
    let secondList;
    try {
        secondList = await api.hooksList([input.repoRoot]);
    }
    catch (error) {
        return failure('verification-failed', error);
    }
    const verification = verifyTrustedHooks(secondList, ownedHooks);
    if (!verification.ok) {
        return verification;
    }
    return {
        ok: true,
        trustedKeys: ownedHooks.map((hook) => hook.key),
        state,
    };
}
export function defaultExpectedCodexHookSourcePaths(repoRoot) {
    return [resolve(repoRoot, '.codex', 'hooks.json')];
}
export function buildCodexTrustStateUpdate(hooks) {
    return Object.fromEntries(hooks.map((hook) => [hook.key, { enabled: true, trusted_hash: hook.currentHash }]));
}
function collectOwnedHooks(response, expectedSourcePaths, selectHook) {
    return response.data.flatMap((entry) => entry.hooks.filter((hook) => selectHook(hook, expectedSourcePaths)));
}
function verifyTrustedHooks(response, ownedHooks) {
    const latestByKey = new Map();
    for (const entry of response.data) {
        for (const hook of entry.hooks) {
            if (hook.handlerType === 'command' &&
                typeof hook.command === 'string' &&
                hook.command.length > 0) {
                latestByKey.set(hook.key, hook);
            }
        }
    }
    const failed = ownedHooks.find((hook) => {
        const latest = latestByKey.get(hook.key);
        return latest === undefined || latest.trustStatus !== 'trusted' || latest.enabled !== true;
    });
    if (!failed) {
        return {
            ok: true,
            trustedKeys: ownedHooks.map((hook) => hook.key),
            state: buildCodexTrustStateUpdate(ownedHooks),
        };
    }
    const latest = latestByKey.get(failed.key);
    return {
        ok: false,
        reason: 'verification-failed',
        message: latest === undefined
            ? `Hook ${failed.key} was not returned by hooks/list after trust sync`
            : `Hook ${failed.key} remained ${latest.trustStatus} enabled=${String(latest.enabled)} after trust sync`,
    };
}
function normalizeExpectedSourcePaths(input) {
    return input.expectedSourcePaths?.length
        ? input.expectedSourcePaths.map((path) => resolve(path))
        : defaultExpectedCodexHookSourcePaths(input.repoRoot);
}
function failure(reason, error) {
    return {
        ok: false,
        reason,
        message: error instanceof Error ? error.message : String(error),
    };
}
//# sourceMappingURL=codex-trust-sync.js.map