export interface PlaywrightE2ePresetOptions {
  testDir?: string;
  timeout?: number;
  fullyParallel?: boolean;
  trace?: "on" | "off" | "retain-on-failure" | "on-first-retry";
}

export interface PlaywrightCompatibleConfig {
  testDir?: string;
  timeout?: number;
  fullyParallel: boolean;
  reporter: [string][];
  use: {
    trace: "on" | "off" | "retain-on-failure" | "on-first-retry";
  };
}

export function createPlaywrightE2ePreset(
  options: PlaywrightE2ePresetOptions = {},
): PlaywrightCompatibleConfig {
  return {
    testDir: options.testDir,
    timeout: options.timeout,
    fullyParallel: options.fullyParallel ?? true,
    reporter: [["list"]],
    use: {
      trace: options.trace ?? "retain-on-failure",
    },
  };
}
