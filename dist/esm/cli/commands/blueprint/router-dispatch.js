export async function executeBlueprintSubcommand(subcommand, args, options, deps) {
    switch (subcommand) {
        case undefined: {
            deps.printBlueprintOutput(deps.getHelpText(), false);
            return;
        }
        case 'list': {
            if (args.length > 1) {
                throw new Error('Usage: ak blueprint list [status]');
            }
            const summaries = await deps.listBlueprints({
                ...options,
                status: args[0],
            });
            deps.printBlueprintOutput(options.json ? summaries : deps.formatBlueprintSummaries(summaries), options.json);
            return;
        }
        case 'new': {
            const goal = args.join(' ').trim();
            if (!goal) {
                throw new Error('Usage: ak blueprint new "<goal>" --complexity <XS|S|M|L|XL>');
            }
            const result = await deps.createBlueprint(goal, options);
            deps.printBlueprintOutput(options.json ? result : deps.formatBlueprintCreation(result), options.json);
            return;
        }
        case 'show': {
            const slug = args[0];
            if (!slug) {
                throw new Error('Usage: ak blueprint show <slug>');
            }
            const result = await deps.showBlueprint(slug, options);
            deps.printBlueprintOutput(options.json ? result : deps.formatBlueprintDetails(result), options.json);
            return;
        }
        case 'exec': {
            const subaction = args[0];
            if (!subaction) {
                throw new Error('Usage: ak blueprint exec <slug>');
            }
            const isControlAction = ['status', 'resume', 'stop', 'logs'].includes(subaction);
            const slug = isControlAction ? args[1] : subaction;
            if (!slug) {
                throw new Error(isControlAction
                    ? `Usage: ak blueprint exec ${subaction} <slug>`
                    : 'Usage: ak blueprint exec <slug>');
            }
            const result = !isControlAction
                ? await deps.executeBlueprint(slug, options)
                : subaction === 'logs'
                    ? await deps.readBlueprintExecutionLogs(slug, options)
                    : await deps.controlBlueprintExec(subaction, slug, options);
            deps.printBlueprintOutput(options.json ? result : deps.formatBlueprintExecution(result), options.json);
            return;
        }
        case 'control': {
            // `ak blueprint control <status|resume|stop> <slug>` — explicit alias
            // for common exec-control actions. Kept alongside `exec <action> <slug>`
            // for discoverability.
            const action = args[0];
            const slug = args[1];
            if (!action || !slug) {
                throw new Error('Usage: ak blueprint control <status|resume|stop> <slug>');
            }
            if (!['status', 'resume', 'stop'].includes(action)) {
                throw new Error(`Unknown blueprint control action: ${action}\n\nUse one of: status, resume, stop`);
            }
            const result = await deps.controlBlueprintExec(action, slug, options);
            deps.printBlueprintOutput(options.json ? result : deps.formatBlueprintExecution(result), options.json);
            return;
        }
        case 'logs': {
            const slug = args[0];
            if (!slug) {
                throw new Error('Usage: ak blueprint logs <slug>');
            }
            const result = await deps.readBlueprintExecutionLogs(slug, options);
            deps.printBlueprintOutput(options.json ? result : deps.formatBlueprintExecution(result), options.json);
            return;
        }
        case 'move': {
            const slug = args[0];
            const status = args[1];
            if (!slug || !status) {
                throw new Error('Usage: ak blueprint move <slug> <status>');
            }
            const result = await deps.moveBlueprint(slug, status, options);
            deps.printBlueprintOutput(options.json ? result : result.message, options.json);
            return;
        }
        case 'start': {
            const slug = args[0];
            if (!slug) {
                throw new Error('Usage: ak blueprint start <slug>');
            }
            const result = await deps.startBlueprint(slug, options);
            deps.printBlueprintOutput(options.json ? result : result.message, options.json);
            return;
        }
        case 'park': {
            const slug = args[0];
            if (!slug) {
                throw new Error('Usage: ak blueprint park <slug>');
            }
            const result = await deps.parkBlueprint(slug, options);
            deps.printBlueprintOutput(options.json ? result : result.message, options.json);
            return;
        }
        case 'finalize': {
            const slug = args[0];
            if (!slug) {
                throw new Error('Usage: ak blueprint finalize <slug>');
            }
            const result = await deps.finalizeBlueprint(slug, options);
            deps.printBlueprintOutput(options.json ? result : result.message, options.json);
            return;
        }
        case 'audit': {
            const result = await deps.auditBlueprints(options);
            if (!result.ok) {
                deps.printBlueprintOutput(options.json ? result : deps.formatBlueprintAudit(result), options.json);
                process.exit(1);
            }
            deps.printBlueprintOutput(options.json ? result : deps.formatBlueprintAudit(result), options.json);
            return;
        }
        case 'task': {
            // Two usage forms:
            //   ak blueprint task <action> <slug> <taskId>               (wp-compatible)
            //   ak blueprint task <slug> <taskId> <action> [--reason X]  (ak-native, per spec)
            const first = args[0];
            const second = args[1];
            const third = args[2];
            if (!first || !second || !third) {
                throw new Error('Usage: ak blueprint task <slug> <taskId> <start|complete|unblock|block --reason <x>>');
            }
            const ACTIONS = ['start', 'block', 'unblock', 'complete'];
            const isAction = (value) => ACTIONS.includes(value);
            let action;
            let slug;
            let taskId;
            if (isAction(first)) {
                action = first;
                slug = second;
                taskId = third;
            }
            else if (isAction(third)) {
                slug = first;
                taskId = second;
                action = third;
            }
            else {
                throw new Error(`Unknown blueprint task action. Use one of: ${ACTIONS.join(', ')}`);
            }
            const result = await deps.mutateBlueprintTask(action, slug, taskId, {
                ...options,
                reason: options.reason,
            });
            deps.printBlueprintOutput(options.json ? result : result.message, options.json);
            return;
        }
        default: {
            throw new Error(`Unknown blueprint subcommand: ${subcommand}\n\nUse one of: list, new, show, exec, start, park, task, finalize, audit, move, control, logs`);
        }
    }
}
//# sourceMappingURL=router-dispatch.js.map