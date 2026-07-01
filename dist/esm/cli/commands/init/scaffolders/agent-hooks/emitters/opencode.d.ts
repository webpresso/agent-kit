export declare const OPENCODE_HOOK_SUPPORT_BOUNDARY: {
    readonly host: "opencode";
    readonly support: "degraded";
    readonly pluginEvents: readonly ["session.created", "tool.execute.before", "tool.execute.after", "experimental.session.compacting", "shell.env"];
    readonly fullManagedEvents: readonly ["SessionStart", "PreToolUse", "PostToolUse"];
    readonly degradedNativeCallbacks: readonly ["PermissionRequest", "PreCompact"];
    readonly unsupportedManagedEvents: readonly ["PostToolUseFailure", "UserPromptSubmit", "Stop", "SubagentStart", "SubagentStop", "SessionEnd", "PostCompact"];
    readonly managedCommandMapping: {
        readonly "session.created": readonly ["wp hook sessionstart-routing"];
        readonly "tool.execute.before": readonly ["wp hook pretool-guard"];
        readonly "tool.execute.after": readonly ["wp hook post-tool"];
        readonly "experimental.session.compacting": readonly ["wp hook sessionstart-routing"];
    };
    readonly degradedNotes: {
        readonly PermissionRequest: "OpenCode exposes permission callbacks, but this managed bridge emits no permission hook.";
        readonly PreCompact: "OpenCode experimental.session.compacting refreshes SessionStart context; no wp-precompact-snapshot command is emitted.";
    };
};
export declare function buildOpencodeHookPluginContent(): string;
//# sourceMappingURL=opencode.d.ts.map