import type { ProviderBootstrapPlan } from '#secrets/providers/types.js'

export interface GitHubBootstrapActionPlan {
  readonly op: 'verify' | 'apply' | 'rotate' | 'revoke'
  readonly requiredSecrets: readonly string[]
  readonly dryRun: boolean
}

export function buildGitHubBootstrapActionPlan(
  op: GitHubBootstrapActionPlan['op'],
  plan: ProviderBootstrapPlan,
): GitHubBootstrapActionPlan {
  return {
    op,
    requiredSecrets: plan.requiredSecrets,
    dryRun: op === 'verify',
  }
}
