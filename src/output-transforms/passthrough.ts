import type { TransformContext, TransformResult } from "./index.js";
import { createTransformResult } from "./metadata.js";

export function passthroughTransform(
  rawOutput: string | undefined,
  context: TransformContext,
): TransformResult {
  if (!rawOutput) return {};

  return createTransformResult(rawOutput, rawOutput, context, {
    tier: 3,
    failures: [],
    legacyTier: "passthrough",
  });
}
