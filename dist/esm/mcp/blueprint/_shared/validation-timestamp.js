import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const VALIDATE_TS_FILE = '.validate-timestamps.json';
export const vtPath = (cwd) => path.join(cwd, '.agent', VALIDATE_TS_FILE);
export function readVt(cwd) {
    try {
        return JSON.parse(readFileSync(vtPath(cwd), 'utf8'));
    }
    catch {
        return {};
    }
}
export function writeVt(cwd, d) {
    mkdirSync(path.dirname(vtPath(cwd)), { recursive: true });
    writeFileSync(vtPath(cwd), JSON.stringify(d, null, 2), 'utf8');
}
//# sourceMappingURL=validation-timestamp.js.map