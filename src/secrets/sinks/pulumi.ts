import type { ResolvedSecretSinkPlan } from './types.js'

export function buildPulumiEnvInjectionPlan(
  plan: ResolvedSecretSinkPlan,
): { readonly sink: 'pulumi'; readonly mode: 'env-only'; readonly profile: string } {
  return {
    sink: 'pulumi',
    mode: 'env-only',
    profile: plan.profile,
  }
}
