import { clipRawOutput } from "#mcp/tools/_shared/result";

import type { Failure, TransformContext, TransformResult } from "./index.js";

export type NumericTransformTier = 1 | 2 | 3;

export function createTransformResult(
  rawOutput: string,
  compactOutput: string,
  context: TransformContext,
  options: {
    readonly tier: NumericTransformTier;
    readonly failures?: readonly Failure[];
    readonly legacyTier?: "passthrough" | "registered";
  },
): TransformResult {
  const rawBytes = Buffer.byteLength(rawOutput);
  const clipped = clipRawOutput(compactOutput, context.maxChars, {
    toolName: context.toolName,
    persistOverflow: context.persistOverflow,
    elisionRecorder: context.elisionRecorder,
  });
  const bytes = Buffer.byteLength(clipped.rawOutput ?? compactOutput);
  const compacted = rawOutput !== compactOutput;
  const needsElision = rawOutput !== (clipped.rawOutput ?? compactOutput);
  const transformElision =
    needsElision && (compacted || !clipped.elisions?.length)
      ? context.elisionRecorder?.record({
          source: context.toolName,
          kind: "truncated_output",
          text: rawOutput,
          returnedText: clipped.rawOutput ?? compactOutput,
          metadata: {
            toolName: context.toolName,
            normalizedToolName: context.normalizedToolName,
            reason: clipped.truncated ? "raw_output_limit" : "output_transform_compaction",
            tier: options.tier,
          },
        })
      : undefined;

  return {
    ...clipped,
    ...(transformElision?.elision
      ? { elisions: [transformElision.elision, ...(clipped.elisions ?? [])] }
      : {}),
    ...(transformElision?.warning
      ? { warnings: [...(clipped.warnings ?? []), transformElision.warning] }
      : {}),
    ...(compactOutput.length === 0 ? { rawOutput: "" } : {}),
    failures: [...(options.failures ?? [])],
    tier: options.tier,
    bytes,
    tokensSaved: Math.max(0, rawBytes - bytes),
    transform: {
      toolName: context.toolName,
      normalizedToolName: context.normalizedToolName,
      tier: options.legacyTier ?? "registered",
      rawBytes,
    },
  };
}
