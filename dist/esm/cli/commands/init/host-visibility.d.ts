export declare const AGENT_HOSTS: readonly ["codex", "claude", "opencode"];
export type AgentHost = (typeof AGENT_HOSTS)[number];
export declare const REQUIRED_CORE_CAPABILITIES: readonly ["fix", "verify", "testing-philosophy", "plan-refine", "pll", "best-practice-research", "claude", "review", "autoplan", "investigate", "health", "plan-eng-review", "plan-ceo-review", "plan-design-review", "plan-devex-review", "browse", "qa-only", "qa", "devex-review", "design-review"];
export declare const VISIBILITY_STATUSES: readonly ["visible-now", "visible-after-restart", "not-visible"];
export type VisibilityStatus = (typeof VISIBILITY_STATUSES)[number];
export interface HostSkillRoots {
    readonly project: readonly string[];
    readonly user: readonly string[];
    readonly global: readonly string[];
}
export interface HostSkillVisibility {
    readonly host: AgentHost;
    readonly capability: string;
    readonly status: VisibilityStatus;
    readonly checkedRoots: readonly string[];
    readonly foundPaths: readonly string[];
    readonly restartRequired: boolean;
}
export interface HostVisibilityAudit {
    readonly selectedHosts: readonly AgentHost[];
    readonly requiredCapabilities: readonly string[];
    readonly results: readonly HostSkillVisibility[];
}
export declare const SETUP_SURFACE_HOSTS: readonly ["claude", "codex", "cursor", "opencode"];
export type SetupSurfaceHost = (typeof SETUP_SURFACE_HOSTS)[number];
export type SetupSurfaceArtifactStatus = 'installed' | 'missing' | 'deferred';
export type SetupSurfaceActiveStatus = 'managed' | 'plugin-bridge' | 'not-installed';
export type SetupSurfaceSupportStatus = 'full' | 'degraded';
export interface HostSetupSurfaceVisibility {
    readonly host: SetupSurfaceHost;
    readonly artifact: SetupSurfaceArtifactStatus;
    readonly active: SetupSurfaceActiveStatus;
    readonly support: SetupSurfaceSupportStatus;
    readonly required: boolean;
    readonly ownership: string;
}
export interface HostSetupSurfaceVisibilityInput {
    readonly repoRoot: string;
    readonly packageRoot: string;
}
export interface AuditHostSkillVisibilityInput {
    readonly repoRoot: string;
    readonly hosts?: readonly AgentHost[];
    readonly requiredCapabilities?: readonly string[];
    readonly homeDir?: string;
    /** Slugs already observed in the active host session. Omit when a restart is needed. */
    readonly liveSkillSlugs?: ReadonlySet<string>;
}
export declare function parseAgentHosts(value: string | undefined): AgentHost[];
export declare function hostSkillRoots(repoRoot: string, host: AgentHost, homeDir?: string): HostSkillRoots;
export declare function auditHostSkillVisibility(input: AuditHostSkillVisibilityInput): HostVisibilityAudit;
export declare function serializeHostVisibility(audit: HostVisibilityAudit): Record<string, Record<string, VisibilityStatus>>;
export declare function summarizeHostVisibility(repoRoot: string, audit: HostVisibilityAudit): string[];
export declare function auditHostSetupSurfaceVisibility(input: HostSetupSurfaceVisibilityInput): readonly HostSetupSurfaceVisibility[];
export declare function summarizeHostSetupSurfaceVisibility(input: HostSetupSurfaceVisibilityInput): string[];
//# sourceMappingURL=host-visibility.d.ts.map