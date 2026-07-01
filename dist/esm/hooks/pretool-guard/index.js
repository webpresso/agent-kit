#!/usr/bin/env bun
import { main as runMain } from "./runner.js";
import { isDirectEntrypoint } from "#hooks/shared/direct-entrypoint";
export { getTarget, getToolType, handleParseError, logValidationResult, main, processValidation, runAllValidators, } from "./runner.js";
export { VALIDATORS } from "./validators/index.js";
if (isDirectEntrypoint(import.meta.url)) {
    runMain();
}
//# sourceMappingURL=index.js.map