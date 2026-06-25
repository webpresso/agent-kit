/**
 * Resolves the tech-debt directory for a consumer repo.
 *
 * Generic consumers use `<repo>/tech-debt`. Webpresso keeps its historical
 * `<repo>/webpresso/tech-debt` layout as a fallback when that directory or the
 * `webpresso/config.yaml` sentinel is present.
 */
import { resolveConsumerRoot } from "./blueprint-root.js";

export const WEBPRESSO_TECH_DEBT_DIR = "webpresso/tech-debt";
export const DEFAULT_TECH_DEBT_DIR = "tech-debt";

export function resolveTechDebtRoot(projectPath?: string): string {
  return resolveConsumerRoot({
    defaultDir: DEFAULT_TECH_DEBT_DIR,
    webpressoDir: WEBPRESSO_TECH_DEBT_DIR,
    projectPath,
  });
}
