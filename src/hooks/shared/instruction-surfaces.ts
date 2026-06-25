import { createRoutingInstructionSource } from "#hooks/shared/routing-block";

export const INSTRUCTION_SURFACE_HOSTS = ["claude", "codex", "cursor", "opencode"] as const;

export type InstructionSurfaceHost = (typeof INSTRUCTION_SURFACE_HOSTS)[number];

export type InstructionSurfaceInput = {
  readonly host: InstructionSurfaceHost;
  readonly projectRoutingMarkdown?: string | null;
  readonly extraSections?: readonly (string | null | undefined)[];
  readonly includeEnvelope?: boolean;
  readonly includeRoutingContent?: boolean;
};

export type InstructionSurface = {
  readonly host: InstructionSurfaceHost;
  readonly artifactName: string;
  readonly content: string;
};

type HostInstructionPolicy = {
  readonly artifactName: string;
  readonly stdoutNoop: string;
  readonly lifecycleNotes: readonly string[];
  readonly publicSupport: string;
};

const HOST_POLICIES = {
  claude: {
    artifactName: "SessionStart.additionalContext",
    stdoutNoop:
      "SessionStart always writes a JSON additionalContext envelope; an empty project routing file still emits the shared routing source.",
    lifecycleNotes: [
      "SessionStart is context injection only and cannot block tool calls.",
      "PreToolUse remains the lifecycle for deny decisions.",
    ],
    publicSupport: "Public support: first-class Claude hook context surface.",
  },
  codex: {
    artifactName: "AGENTS.md",
    stdoutNoop:
      "Codex hook commands with no action write {} on stdout; durable guidance belongs in AGENTS.md.",
    lifecycleNotes: [
      "Codex reads repository instruction files for durable guidance.",
      "Unsupported managed lifecycle names are documented in the host capability matrix, not emulated here.",
    ],
    publicSupport: "Public support: first-class Codex instruction artifact.",
  },
  cursor: {
    artifactName: "agent-rules/webpresso-routing.md -> .cursor/rules/webpresso-routing.mdc",
    stdoutNoop:
      "Cursor command hooks that do not need to act write {} so the host receives valid JSON.",
    lifecycleNotes: [
      "Cursor uses command groups; beforeSubmitPrompt is the prompt-time lifecycle.",
      "Unsupported managed lifecycle names are represented in capability tests, not generated as inert hooks.",
    ],
    publicSupport: "Public support: generated Cursor rules surface plus managed hook config.",
  },
  opencode: {
    artifactName: ".opencode/plugins/webpresso-hooks.js",
    stdoutNoop:
      "OpenCode plugin callbacks return without writing when there is no action; context is carried through host callback state.",
    lifecycleNotes: [
      "OpenCode maps session.created and experimental.session.compacting to context refresh.",
      "Unsupported lifecycle callbacks stay absent unless OpenCode exposes a managed callback.",
    ],
    publicSupport: "Public support: degraded OpenCode plugin bridge.",
  },
} as const satisfies Record<InstructionSurfaceHost, HostInstructionPolicy>;

function nonEmpty(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.length > 0;
}

function joinSections(sections: readonly string[]): string {
  return sections.join("\n\n");
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function routingToolNamesFromSource(content: string): readonly string[] {
  return [...content.matchAll(/<tool name="([^"]+)">/gu)].map((match) => match[1] as string);
}

function renderHostEnvelope(
  host: InstructionSurfaceHost,
  policy: HostInstructionPolicy,
  sourceName: string,
  routingContent: string,
): string {
  const toolNames = routingToolNamesFromSource(routingContent).join(", ");
  const lifecycleNotes = policy.lifecycleNotes
    .map((note) => `    <note>${xmlEscape(note)}</note>`)
    .join("\n");

  return `<wp_instruction_surface host="${host}" artifact="${xmlEscape(policy.artifactName)}" source="${sourceName}">
  <host_contract>
    <native_tool_names>${xmlEscape(toolNames)}</native_tool_names>
    <stdout_noop>${xmlEscape(policy.stdoutNoop)}</stdout_noop>
    <lifecycle_notes>
${lifecycleNotes}
    </lifecycle_notes>
    <public_support>${xmlEscape(policy.publicSupport)}</public_support>
  </host_contract>
</wp_instruction_surface>`;
}

export function renderInstructionSurface(input: InstructionSurfaceInput): InstructionSurface {
  const policy = HOST_POLICIES[input.host];
  const source = createRoutingInstructionSource();
  const includeEnvelope = input.includeEnvelope ?? true;
  const includeRoutingContent = input.includeRoutingContent ?? false;
  const sections = [
    ...(includeEnvelope
      ? [renderHostEnvelope(input.host, policy, source.name, source.content)]
      : []),
    includeRoutingContent ? source.content : null,
    input.projectRoutingMarkdown ?? null,
    ...(input.extraSections ?? []),
  ].filter(nonEmpty);

  return {
    host: input.host,
    artifactName: policy.artifactName,
    content: joinSections(sections),
  };
}

export function renderSessionStartInstructionContext(input: {
  readonly projectRoutingMarkdown?: string | null;
  readonly extraSections?: readonly (string | null | undefined)[];
}): string {
  return renderInstructionSurface({
    host: "claude",
    projectRoutingMarkdown: input.projectRoutingMarkdown,
    extraSections: input.extraSections,
    includeEnvelope: false,
    includeRoutingContent: true,
  }).content;
}
