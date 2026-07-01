import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const qualityScaffoldTestDir = join(moduleDir, "quality-scaffold");

const defaultQualityScaffoldConfig = {
  testDir: qualityScaffoldTestDir,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
} satisfies PlaywrightTestConfig;

export type QualityScaffoldConfigOverrides = Omit<PlaywrightTestConfig, "testDir"> & {
  /** Override only for advanced migrations; default points at the package-owned scaffold tests. */
  testDir?: string;
};

export function createQualityScaffoldConfig(
  overrides: QualityScaffoldConfigOverrides = {},
): PlaywrightTestConfig {
  const { use: overrideUse, ...restOverrides } = overrides;

  return defineConfig({
    ...defaultQualityScaffoldConfig,
    ...restOverrides,
    use: {
      ...defaultQualityScaffoldConfig.use,
      ...overrideUse,
    },
  });
}

export default createQualityScaffoldConfig;
