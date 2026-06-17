import { writeFileSync } from 'node:fs';
export function writeJsonFile(path, data, options = {}) {
    const indent = options.indent ?? 2;
    const trailingNewline = options.trailingNewline ?? true;
    const spacing = indent === 0 ? undefined : indent;
    const text = JSON.stringify(data, null, spacing);
    writeFileSync(path, `${text}${trailingNewline ? '\n' : ''}`, options.writeFileOptions);
}
//# sourceMappingURL=write-json-file.js.map