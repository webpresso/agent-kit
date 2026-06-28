import { defineConfig } from "vitest/config";

// Standalone config: agent-core is a pure-node leaf package, so it must NOT
// inherit the monorepo-root vitest config (which wires a global-setup that does
// not exist here). Plain node environment, colocated tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
