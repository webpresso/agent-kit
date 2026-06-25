import type { ToolInput, ValidationResult } from "#hooks/shared/types";
import type { DuplicateFunctionResult } from "./package-imports.types.js";

import {
  createBlockedResult,
  findDuplicateFunctions,
  getSharedFunctions,
} from "#quality-engine/package-import-rules";
import { getContent, getFilePath } from "#hooks/shared/types";
import { createSkipResult } from "./skip-result.js";

export type { DuplicateFunctionResult } from "./package-imports.types.js";

export interface ValidatePackageImportsOptions {
  profile?: "generic" | "webpresso";
}

export const VALIDATOR_NAME = "package-imports";
export const SKIP_ENV_VAR = "PACKAGE_IMPORTS_SKIP";

const IMPL_EXTENSIONS = /\.(ts|tsx|js|jsx)$/;

export function validatePackageImports(
  input: ToolInput,
  options: ValidatePackageImportsOptions = {},
): ValidationResult | DuplicateFunctionResult {
  if (process.env[SKIP_ENV_VAR] === "1") return createSkipResult(VALIDATOR_NAME);

  const filePath = getFilePath(input);
  const content = getContent(input);
  const profile = options.profile ?? "generic";

  if (!content || !filePath) return { validator: VALIDATOR_NAME, passed: true };
  if (!IMPL_EXTENSIONS.test(filePath)) return { validator: VALIDATOR_NAME, passed: true };

  const sharedFunctions = getSharedFunctions(profile);

  if (
    sharedFunctions.some(
      (fn) =>
        filePath.includes(`/${fn.source}/`) ||
        filePath.includes(`/${fn.package.replace("@", "").replace("/", "-")}/`),
    )
  ) {
    return { validator: VALIDATOR_NAME, passed: true };
  }

  const duplicate = findDuplicateFunctions(content, { profile })[0];
  if (!duplicate) return { validator: VALIDATOR_NAME, passed: true };

  const blocked = createBlockedResult(duplicate);
  return {
    validator: VALIDATOR_NAME,
    passed: false,
    message: `Local implementation of "${duplicate.name}" detected. ${blocked.message}`,
    functionName: blocked.functionName,
    suggestion: blocked.suggestion,
    package: blocked.package,
    source: blocked.source,
  };
}
