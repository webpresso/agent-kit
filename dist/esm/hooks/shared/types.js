export function parseToolInput(json) {
    return JSON.parse(json);
}
export function isBashInput(input) {
    return 'command' in (input.tool_input || {});
}
export function isFileEditInput(input) {
    const toolInput = input.tool_input || {};
    return 'file_path' in toolInput && 'old_string' in toolInput && 'new_string' in toolInput;
}
export function isFileWriteInput(input) {
    const toolInput = input.tool_input || {};
    return 'file_path' in toolInput && 'content' in toolInput;
}
export function isFileReadInput(input) {
    const toolInput = input.tool_input || {};
    return 'file_path' in toolInput && !('content' in toolInput) && !('old_string' in toolInput);
}
export function getFilePath(input) {
    const toolInput = input.tool_input;
    if (!toolInput || typeof toolInput !== 'object')
        return undefined;
    const filePath = toolInput.file_path;
    return typeof filePath === 'string' ? filePath : undefined;
}
export function getCommand(input) {
    if (isBashInput(input)) {
        const toolInput = input.tool_input;
        if (!toolInput || typeof toolInput !== 'object')
            return undefined;
        const command = toolInput.command;
        return typeof command === 'string' ? command : undefined;
    }
    return undefined;
}
export function getContent(input) {
    const toolInput = input.tool_input;
    if (!toolInput || typeof toolInput !== 'object')
        return undefined;
    const content = toolInput.content;
    const newString = toolInput.new_string;
    if (typeof content === 'string')
        return content;
    if (typeof newString === 'string')
        return newString;
    return undefined;
}
//# sourceMappingURL=types.js.map