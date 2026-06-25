import path from "node:path";

import type { ToolInput, ValidationResult } from "#hooks/shared/types";

import { getFilePath, isFileEditInput, isFileWriteInput } from "#hooks/shared/types";
import { validateBlueprint as validateBlueprintShared } from "#hooks/shared/validators/blueprint";
import { isCanonicalBlueprintDocumentPath } from "./path-contract.js";
import { buildRedirectMessage } from "./mcp-redirect.js";

function normalizeFilePath(filePath: string, cwd?: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  if (!cwd) return filePath.replace(/^\/+/, "");
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}

export function validateBlueprint(input: ToolInput): ValidationResult {
  const filePath = getFilePath(input);

  if (filePath && (isFileWriteInput(input) || isFileEditInput(input))) {
    const normalized = normalizeFilePath(filePath, input.cwd);
    if (isCanonicalBlueprintDocumentPath(normalized)) {
      return {
        validator: "blueprint",
        passed: false,
        message: buildRedirectMessage({
          category: "blueprint",
          command: normalized,
          fallbackHint: "wp_blueprint MCP tool for lifecycle transitions",
        }),
      };
    }
  }

  const result = validateBlueprintShared(filePath);

  if (result.details?.skipReason) {
    return {
      validator: "blueprint",
      passed: true,
      skipped: true,
      skipReason: result.details.skipReason,
    };
  }

  return { validator: "blueprint", passed: result.valid };
}
