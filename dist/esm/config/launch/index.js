/**
 * Contract-safe `webpresso/launch` public surface.
 *
 * This package defines generic, host-agnostic launch primitives. Host
 * adapters (e.g. the Neon-backed provisioner in `@webpresso/cli-utils`)
 * consume these contracts; launch-engine itself has no dependency on any
 * host-specific package and uses no Webpresso app-slug literals.
 */
export { assembleEffectiveVars } from "./launch-profile.js";
export { buildLaunchRegistration, } from "./provision-stack.js";
export { parseDevManifest, resolveDevTargets, } from "./dev-manifest.js";
//# sourceMappingURL=index.js.map