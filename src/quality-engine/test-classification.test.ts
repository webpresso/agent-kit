/**
 * Test Classification Tests
 *
 * Tests for test file classification (unit, integration, e2e, worker).
 */

import { describe, expect, it } from "vitest";

import {
  classifyTestFile,
  hasIntegrationSignature,
  hasWorkerSignature,
} from "./test-classification";

// =============================================================================
// hasWorkerSignature
// =============================================================================

describe("hasWorkerSignature", () => {
  it("returns false for empty content", () => {
    expect(hasWorkerSignature("")).toBe(false);
  });

  it("detects cloudflare:test import", () => {
    const content = `import { createExecutionContext } from 'cloudflare:test'`;
    expect(hasWorkerSignature(content)).toBe(true);
  });

  it("detects cloudflare:test double-quoted import", () => {
    const content = `import { createExecutionContext } from "cloudflare:test"`;
    expect(hasWorkerSignature(content)).toBe(true);
  });

  it("detects wrangler import", () => {
    const content = `import something from 'wrangler'`;
    expect(hasWorkerSignature(content)).toBe(true);
  });

  it("detects @cloudflare/vitest-pool-workers import", () => {
    const content = `import { getPlatformProxy } from '@cloudflare/vitest-pool-workers'`;
    expect(hasWorkerSignature(content)).toBe(true);
  });

  it("returns false for unrelated imports", () => {
    const content = `import { describe, it } from 'vitest'`;
    expect(hasWorkerSignature(content)).toBe(false);
  });

  it("detects signature when only one import line matches", () => {
    const content = `const x = 1\nimport { db } from '@webpresso/database'\nconst y = 2`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });

  it("returns false when signature appears in non-import line", () => {
    const content = `// This file uses cloudflare:test internally`;
    expect(hasWorkerSignature(content)).toBe(false);
  });

  it("matches imports with leading whitespace", () => {
    const content = `  import { db } from '@webpresso/database'`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });
});

// =============================================================================
// hasIntegrationSignature
// =============================================================================

describe("hasIntegrationSignature", () => {
  it("returns false for empty content", () => {
    expect(hasIntegrationSignature("")).toBe(false);
  });

  it("detects @webpresso/database import", () => {
    const content = `import { db } from '@webpresso/database'`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });

  it("detects pg import", () => {
    const content = `import pg from 'pg'`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });

  it("detects docker import", () => {
    const content = `import Docker from 'docker'`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });

  it("detects supertest import", () => {
    const content = `import request from 'supertest'`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });

  it("detects node:child_process import", () => {
    const content = `import { exec } from 'node:child_process'`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });

  it("detects execa import", () => {
    const content = `import { execa } from 'execa'`;
    expect(hasIntegrationSignature(content)).toBe(true);
  });

  it("returns false for unrelated content", () => {
    const content = `const x = 1 + 2`;
    expect(hasIntegrationSignature(content)).toBe(false);
  });
});

// =============================================================================
// classifyTestFile
// =============================================================================

describe("classifyTestFile", () => {
  describe("e2e classification", () => {
    it("classifies file in e2e directory as e2e", () => {
      expect(classifyTestFile("apps/e2e/tests/login.test.ts", "")).toBe("e2e");
    });

    it("excludes e2e/lib files from e2e", () => {
      expect(classifyTestFile("apps/e2e/lib/helpers.ts", "")).toBe("unit");
    });

    it("excludes e2e/scripts files from e2e", () => {
      expect(classifyTestFile("apps/e2e/scripts/setup.ts", "")).toBe("unit");
    });

    it("excludes e2e/src files from e2e", () => {
      expect(classifyTestFile("apps/e2e/src/utils.ts", "")).toBe("unit");
    });

    it("classifies .e2e.test.ts files as e2e", () => {
      expect(classifyTestFile("apps/web/tests/flow.e2e.test.ts", "")).toBe("e2e");
    });

    it("classifies .e2e.test.tsx files as e2e", () => {
      expect(classifyTestFile("apps/web/tests/flow.e2e.test.tsx", "")).toBe("e2e");
    });

    it("classifies .e2e.ts files as e2e", () => {
      expect(classifyTestFile("apps/web/tests/flow.e2e.ts", "")).toBe("e2e");
    });

    it("classifies file with @playwright/test import as e2e", () => {
      const content = `import { test, expect } from '@playwright/test'`;
      expect(classifyTestFile("some/file.test.ts", content)).toBe("e2e");
    });

    it("classifies file with @playwright/test double-quoted import as e2e", () => {
      const content = `import { test, expect } from "@playwright/test"`;
      expect(classifyTestFile("some/file.test.ts", content)).toBe("e2e");
    });

    it("detects @playwright/test import on any line (regex uses /m flag)", () => {
      const content = `const x = 1\nimport { test } from '@playwright/test'`;
      expect(classifyTestFile("some/file.test.ts", content)).toBe("e2e");
    });
  });

  describe("worker classification", () => {
    it("classifies .workers.test.ts files as worker", () => {
      expect(classifyTestFile("apps/workers/chef/chef.workers.test.ts", "")).toBe("worker");
    });

    it("classifies .workers.test.tsx files as worker", () => {
      expect(classifyTestFile("apps/workers/chef/chef.workers.test.tsx", "")).toBe("worker");
    });

    it("classifies .miniflare.test.ts files as worker", () => {
      expect(classifyTestFile("apps/workers/chef/chef.miniflare.test.ts", "")).toBe("worker");
    });

    it("classifies .miniflare.test.tsx files as worker", () => {
      expect(classifyTestFile("apps/workers/chef/chef.miniflare.test.tsx", "")).toBe("worker");
    });

    it("classifies file with worker signature as worker", () => {
      const content = `import { createExecutionContext } from 'cloudflare:test'`;
      expect(classifyTestFile("apps/workers/chef/chef.test.ts", content)).toBe("worker");
    });
  });

  describe("integration classification", () => {
    it("classifies .integration.test.ts files as integration", () => {
      expect(classifyTestFile("apps/web/tests/db.integration.test.ts", "")).toBe("integration");
    });

    it("classifies .integration.test.tsx files as integration", () => {
      expect(classifyTestFile("apps/web/tests/db.integration.test.tsx", "")).toBe("integration");
    });

    it("classifies file with integration signature as integration", () => {
      const content = `import pkg from '@webpresso/database'`;
      expect(classifyTestFile("apps/web/tests/db.test.ts", content)).toBe("integration");
    });
  });

  describe("unit classification", () => {
    it("classifies regular test files as unit", () => {
      expect(classifyTestFile("packages/sdk/config/src/index.test.ts", "")).toBe("unit");
    });

    it("classifies empty files as unit", () => {
      expect(classifyTestFile("packages/sdk/config/src/index.ts", "")).toBe("unit");
    });

    it("returns unit when no classification matches", () => {
      expect(classifyTestFile("src/random/file.ts", "unknown content")).toBe("unit");
    });
  });

  describe("classification priority", () => {
    it("e2e takes priority over worker", () => {
      const content = `import { createExecutionContext } from 'cloudflare:test'`;
      expect(classifyTestFile("apps/e2e/tests/worker.test.ts", content)).toBe("e2e");
    });

    it("worker takes priority over integration", () => {
      const content = `import { createExecutionContext } from 'cloudflare:test'\nimport { db } from '@webpresso/database'`;
      expect(classifyTestFile("apps/workers/chef/chef.workers.test.ts", content)).toBe("worker");
    });

    it("integration takes priority over unit", () => {
      const content = `import { db } from '@webpresso/database'`;
      expect(classifyTestFile("some/test.integration.test.ts", content)).toBe("integration");
    });
  });
});
