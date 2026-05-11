/**
 * Contract-safe `@webpresso/launch-engine` public surface.
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
} from './contracts'
export { type AssembleEffectiveVarsInput, assembleEffectiveVars } from './launch-profile'
export {
  type BuildLaunchRegistrationInput,
  type LaunchRegistrationSpawnContext,
  type LaunchRegistrationSpawnPlan,
  buildLaunchRegistration,
} from './provision-stack'
export type {
  DevRestartPolicy,
  DevServiceRuntimeState,
  DevServiceRuntimeStatus,
  DevServiceStartPlan,
  DevSupervisorAdapter,
  ServiceReadiness,
} from './dev-contracts'
export {
  type DevManifestGroupInput,
  type DevManifestInput,
  type DevManifestServiceInput,
  type NormalizedDevGroup,
  type NormalizedDevManifest,
  type NormalizedDevService,
  parseDevManifest,
  resolveDevTargets,
} from './dev-manifest'
