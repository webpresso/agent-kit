/**
 * Contract-safe `@webpresso/agent-launch` public surface.
 *
 * This package defines generic, host-agnostic launch primitives. Host
 * adapters (e.g. the Neon-backed provisioner in `@webpresso/cli-utils`)
 * consume these contracts; launch-engine itself has no dependency on any
 * host-specific package and uses no Webpresso app-slug literals.
 */

export type {
  DatabaseUrlSelector,
  LaunchProfile,
  LaunchRegistration,
  ProvisionedDatabaseHandle,
} from './contracts.js'
export { type AssembleEffectiveVarsInput, assembleEffectiveVars } from './launch-profile.js'
export {
  type BuildLaunchRegistrationInput,
  type LaunchRegistrationSpawnContext,
  type LaunchRegistrationSpawnPlan,
  buildLaunchRegistration,
} from './provision-stack.js'
export type {
  DevRestartPolicy,
  DevServiceRuntimeState,
  DevServiceRuntimeStatus,
  DevServiceStartPlan,
  DevSupervisorAdapter,
  ServiceReadiness,
} from './dev-contracts.js'
export {
  type DevManifestGroupInput,
  type DevManifestInput,
  type DevManifestServiceInput,
  type NormalizedDevGroup,
  type NormalizedDevManifest,
  type NormalizedDevService,
  parseDevManifest,
  resolveDevTargets,
} from './dev-manifest.js'
