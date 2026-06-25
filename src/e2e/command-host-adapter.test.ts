import { describe, expect, it } from "vitest";

import { createCommandE2eHostAdapter } from "./command-host-adapter.js";

describe("createCommandE2eHostAdapter", () => {
  it("clones suite metadata and builds a single command execution plan", () => {
    const adapter = createCommandE2eHostAdapter({
      listSuites: () => [
        {
          id: "foundation",
          aliases: ["smoke"],
          fileMatchers: ["journeys/worker-health.e2e.ts"],
          batchKey: "foundation",
          env: { E2E_BASE_URL: "http://127.0.0.1:8787" },
          steps: [
            {
              runner: "vitest",
              logName: "foundation",
              configPath: "vitest.journeys.config.ts",
              fixedFiles: ["journeys/worker-health.e2e.ts"],
              env: { FORCE_COLOR: "1" },
            },
          ],
        },
      ],
      resolveSuiteId: (name) => (name === "smoke" ? "foundation" : null),
      normalizeFilePath: (filePath) => filePath.replace(/^apps\/e2e\//, ""),
      resolveSuiteForFile: (filePath) => ({
        normalizedPath: filePath.replace(/^apps\/e2e\//, ""),
        suiteId: "foundation",
      }),
      defaultSuiteId: "foundation",
      buildCommandGroup: (request) => ({
        batchKey: "host",
        env: { E2E_BASE_URL: "http://127.0.0.1:8787" },
        run: {
          batchKey: "host",
          logName: "host",
          command: "pnpm",
          args:
            request.suite === "foundation"
              ? ["--dir", "apps/e2e", "run", "e2e:run", "--", "--suite", "foundation"]
              : ["--dir", "apps/e2e", "run", "e2e:run"],
        },
      }),
    });

    const suites = adapter.listSuites();
    const step = suites[0]?.steps[0];

    expect(suites).toEqual([
      {
        id: "foundation",
        aliases: ["smoke"],
        fileMatchers: ["journeys/worker-health.e2e.ts"],
        batchKey: "foundation",
        envProfile: undefined,
        env: { E2E_BASE_URL: "http://127.0.0.1:8787" },
        steps: [
          {
            runner: "vitest",
            logName: "foundation",
            configPath: "vitest.journeys.config.ts",
            fixedFiles: ["journeys/worker-health.e2e.ts"],
            fixedArgs: undefined,
            commandArgs: undefined,
            supportsHeaded: undefined,
            supportsDebug: undefined,
            batchKey: undefined,
            envProfile: undefined,
            reportDir: undefined,
            env: { FORCE_COLOR: "1" },
          },
        ],
      },
    ]);

    (step?.fixedFiles as string[] | undefined)?.push("mutated");
    expect(adapter.listSuites()[0]?.steps[0]?.fixedFiles).toEqual([
      "journeys/worker-health.e2e.ts",
    ]);

    expect(adapter.buildExecutionPlan?.({ suite: "foundation" })).toEqual([
      {
        batchKey: "host",
        envProfile: undefined,
        env: { E2E_BASE_URL: "http://127.0.0.1:8787" },
        runs: [
          {
            suiteId: "foundation",
            batchKey: "host",
            envProfile: undefined,
            env: undefined,
            runner: "command",
            logName: "host",
            reportDir: undefined,
            command: "pnpm",
            args: ["--dir", "apps/e2e", "run", "e2e:run", "--", "--suite", "foundation"],
          },
        ],
      },
    ]);
  });
});
