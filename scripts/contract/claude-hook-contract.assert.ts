/**
 * Claude Code hook contract — type-only drift assertion (scheduled, NON-required).
 *
 * Pins the shape of what our pretool-guard emits/consumes against the published
 * `@anthropic-ai/claude-agent-sdk` types. COMPILE-ONLY: pure `import type`, zero
 * runtime, never executed.
 *
 * It depends on `@anthropic-ai/claude-agent-sdk`, which is NOT a repo dependency,
 * so it lives under `scripts/` (outside the repo tsconfig `include: ["src/**"]`)
 * and is never seen by required `wp typecheck`. The scheduled
 * hook-contract-drift workflow installs the SDK and runs `tsc` against this file
 * with `scripts/contract/tsconfig.claude-contract.json`. A break here means the
 * upstream Claude hook contract drifted from ours.
 *
 * The deny-envelope / stdin shapes below are inlined copies of our contract in
 * `src/hooks/shared/types.ts` (kept deliberately tiny). The authoritative
 * round-trip of our real `buildDenyEnvelope` is already covered by
 * `src/hooks/__conformance__/codex-contract.test.ts` in required CI; this file's
 * job is purely to catch SDK-side drift (e.g. `permissionDecision` losing
 * `deny`, or the snake_case stdin fields being renamed).
 */

import type {
  HookInput,
  HookPermissionDecision,
  PreToolUseHookInput,
  SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

// Inlined from src/hooks/shared/types.ts (our emitted PreToolUse deny envelope).
type DenyEnvelope = {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PreToolUse";
    readonly permissionDecision: "deny";
    readonly permissionDecisionReason: string;
  };
};
type ToolInput = { tool_name?: string; tool_input?: { command?: string; file_path?: string } };

// Compile-time assertion helper: `Expect<Assignable<A, B>>` fails to type-check
// unless A is assignable to B.
type Assignable<A, B> = A extends B ? true : false;
type Expect<T extends true> = T;

// 1) Output contract — our deny envelope must be a valid Claude hook output.
//    Catches the SDK changing `hookSpecificOutput` shape or making
//    `permissionDecision: "deny"` no longer assignable.
export type _DenyEnvelopeIsValidClaudeOutput = Expect<Assignable<DenyEnvelope, SyncHookJSONOutput>>;

// 2) Decision values — our 'deny' must remain a member of the SDK's decision
//    union (HookPermissionDecision = 'allow'|'deny'|'ask'|'defer' as of
//    @anthropic-ai/claude-agent-sdk 0.3.190). If the SDK ever removed 'deny'
//    this breaks. (Codex notably does NOT support 'defer'/'ask'.)
export type _OurDenyIsAKnownDecision = Expect<Assignable<"deny", HookPermissionDecision>>;

// 3) Stdin contract — PreToolUse input is snake_case and a member of HookInput.
//    Catches a rename of tool_name / tool_input / hook_event_name.
export type _PreToolUseInputIsHookInput = Expect<Assignable<PreToolUseHookInput, HookInput>>;
type _RequiredStdinFields = Pick<
  PreToolUseHookInput,
  "tool_name" | "tool_input" | "hook_event_name" | "session_id" | "cwd"
>;
// Our ToolInput surface lines up with the SDK's tool_input being an object
// payload (we narrow it ourselves; the SDK leaves it unknown).
export const _toolInputIsObjectShaped = (input: ToolInput): _RequiredStdinFields["tool_input"] =>
  input as _RequiredStdinFields["tool_input"];
