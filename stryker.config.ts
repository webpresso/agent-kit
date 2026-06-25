import { baseConfig } from "./packages/agent-config/src/stryker/index.ts";

function parseMutationFilesFromEnv(value: string | undefined): string[] | null {
  const files =
    value
      ?.split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean) ?? [];

  return files.length > 0 ? files : null;
}

const defaultMutate = [
  "src/**/*.ts",
  "!src/**/*.test.ts",
  "!src/**/*.d.ts",
  "!src/**/__fixtures__/**",
];

const config = {
  ...baseConfig,
  thresholds: {
    high: 85,
    low: 85,
    break: 85,
  },
  mutator: {
    excludedMutations: [],
  },
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.stryker.config.ts",
  },
  coverageAnalysis: "perTest",
  ignoreStatic: false,
  // inPlace:true — no sandbox copy overhead. The previous inPlace:false was added after
  // a mid-run pkill left source files instrumented; start clean and this is safe.
  inPlace: true,
  // incremental: only re-test mutants affected by code changes after the first run
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  concurrency: 6,
  mutate: parseMutationFilesFromEnv(process.env.STRYKER_MUTATE_FILES) ?? defaultMutate,
};

export default config;
