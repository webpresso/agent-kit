import { describe, expect, it } from "vitest";

import {
  defineE2eSuite,
  normalizeE2ePath,
  resolveE2eSuiteForPath,
  resolveE2eSuiteId,
} from "./suite-registry.js";

describe("defineE2eSuite", () => {
  it("returns the manifest unchanged", () => {
    const suite = defineE2eSuite({
      id: "journeys",
      fileMatchers: ["journeys/"],
      batchKey: "journeys",
      aliases: ["smoke-journeys"],
      steps: [
        {
          runner: "playwright",
          logName: "journeys",
          configPath: "apps/e2e/playwright.config.ts",
        },
      ],
    });

    expect(suite.id).toBe("journeys");
    expect(suite.steps[0]?.runner).toBe("playwright");
  });
});

describe("normalizeE2ePath", () => {
  it("normalizes repo-root apps/e2e paths", () => {
    expect(normalizeE2ePath("apps/e2e/tests/journeys/login.spec.ts")).toBe(
      "tests/journeys/login.spec.ts",
    );
  });

  it("normalizes app-local worker e2e paths", () => {
    expect(normalizeE2ePath("apps/workers/platform-api/e2e/main/graphql.e2e.ts")).toBe(
      "main/graphql.e2e.ts",
    );
  });
});

describe("resolveE2eSuiteId", () => {
  const suites = [
    defineE2eSuite({
      id: "journeys",
      fileMatchers: ["tests/journeys/"],
      batchKey: "journeys",
      aliases: ["smoke-journeys"],
      steps: [
        { runner: "playwright", logName: "journeys", configPath: "apps/e2e/playwright.config.ts" },
      ],
    }),
    defineE2eSuite({
      id: "platform-api",
      fileMatchers: ["main/"],
      batchKey: "platform-api",
      steps: [
        {
          runner: "vitest",
          logName: "platform-api",
          configPath: "apps/workers/platform-api/e2e/vitest.config.ts",
        },
      ],
    }),
  ];

  it("resolves an explicit suite id", () => {
    expect(resolveE2eSuiteId("platform-api", suites)).toBe("platform-api");
  });

  it("resolves an alias to the concrete suite id", () => {
    expect(resolveE2eSuiteId("smoke-journeys", suites)).toBe("journeys");
  });
});

describe("resolveE2eSuiteForPath", () => {
  const suites = [
    defineE2eSuite({
      id: "journeys",
      fileMatchers: ["tests/journeys/"],
      batchKey: "journeys",
      steps: [
        { runner: "playwright", logName: "journeys", configPath: "apps/e2e/playwright.config.ts" },
      ],
    }),
    defineE2eSuite({
      id: "platform-api",
      fileMatchers: ["main/"],
      batchKey: "platform-api",
      steps: [
        {
          runner: "vitest",
          logName: "platform-api",
          configPath: "apps/workers/platform-api/e2e/vitest.config.ts",
        },
      ],
    }),
  ];

  it("resolves a suite id from a file path", () => {
    expect(resolveE2eSuiteForPath("apps/e2e/tests/journeys/login.spec.ts", suites)).toEqual({
      normalizedPath: "tests/journeys/login.spec.ts",
      suiteId: "journeys",
    });
  });

  it("returns null for unknown suites", () => {
    expect(resolveE2eSuiteForPath("apps/e2e/tests/unknown.spec.ts", suites)).toBeNull();
  });
});
