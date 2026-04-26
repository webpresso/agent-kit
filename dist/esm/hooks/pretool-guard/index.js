#!/usr/bin/env node
import { main as runMain } from './runner.js';
export { getTarget, getToolType, handleParseError, logValidationResult, main, processValidation, runAllValidators, } from './runner.js';
export { VALIDATORS } from './validators/index.js';
if (import.meta.url === `file://${process.argv[1]}`) {
    runMain();
}
//# sourceMappingURL=index.js.map