function notImplementedMessage(scope, name) {
    return `${scope} bundle command "${name}" is not implemented yet.`;
}
export function placeholderCommand(scope, name, description) {
    return {
        meta: { description, name },
        run: () => {
            throw new Error(notImplementedMessage(scope, name));
        },
    };
}
export function placeholderGroup(scope, name, description, subCommands) {
    return {
        meta: { description, name },
        subCommands: Object.fromEntries(Object.entries(subCommands).map(([subCommandName, command]) => [
            subCommandName,
            () => command,
        ])),
    };
}
//# sourceMappingURL=helpers.js.map