export declare const DEFAULT_BUDGETS: {
    readonly 'codex-skill-listing-total': {
        readonly max_bytes: 7000;
    };
    readonly 'claude-skill-description-each': {
        readonly max_bytes: 800;
    };
    readonly 'agents-md-section-each': {
        readonly max_bytes: 4096;
        readonly suggest_compact_at: 0.75;
    };
    readonly 'skill-md-total-each': {
        readonly max_bytes: 16384;
    };
};
export type BudgetKey = keyof typeof DEFAULT_BUDGETS;
export type BudgetEntry = {
    max_bytes: number;
    suggest_compact_at?: number;
    warn_pct?: number;
};
export type ResolvedBudgets = typeof DEFAULT_BUDGETS & Record<string, BudgetEntry>;
/**
 * Load budgets from `.agent/.audit-budgets.yaml` if present, merging with defaults.
 * Unknown keys from the file are accepted; missing keys fall back to defaults.
 */
export declare function loadBudgets(cwd: string): ResolvedBudgets;
//# sourceMappingURL=_budgets.d.ts.map