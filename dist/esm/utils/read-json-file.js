import { readFileSync } from "node:fs";
/**
 * Read repo-owned JSON whose shape is already constrained by the owning caller.
 * Prefer readJsonFileWithSchema for user input, persisted config, and tool payloads.
 */
export function readTrustedJsonFile(path) {
    return readJsonUnknown(path);
}
export function readJsonFileWithSchema(path, schema) {
    try {
        return schema.parse(readJsonUnknown(path));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`JSON file ${path} failed schema validation: ${message}`, { cause: error });
    }
}
function readJsonUnknown(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read JSON file ${path}: ${message}`, { cause: error });
    }
}
//# sourceMappingURL=read-json-file.js.map