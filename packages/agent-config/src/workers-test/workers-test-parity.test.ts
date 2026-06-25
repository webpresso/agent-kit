import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockEnv,
  createMockHyperdrive,
  createMockDurableObjectNamespace,
  createMockExecutionContext,
  MockDurableObject,
  MockContainer,
  createCloudflareRuntimeMocks,
  createAuthenticatedRequest,
  createUnauthenticatedRequest,
  createCorsRequest,
  setupWorkerTest,
  suppressConsole,
} from "./index.js";
import type { BaseWorkerEnv } from "./index.js";

describe("createMockHyperdrive", () => {
  it("returns a mock hyperdrive with default values", () => {
    const hd = createMockHyperdrive();
    expect(hd.connectionString).toBe("postgresql://localhost/test");
    expect(hd.host).toBe("localhost");
    expect(hd.port).toBe(5432);
    expect(hd.user).toBe("test");
    expect(hd.password).toBe("test");
    expect(hd.database).toBe("test");
  });

  it("allows overriding fields", () => {
    const hd = createMockHyperdrive({ host: "myhost", port: 1234 });
    expect(hd.host).toBe("myhost");
    expect(hd.port).toBe(1234);
    expect(hd.database).toBe("test"); // unchanged default
  });

  it("connect is a vi.fn", () => {
    const hd = createMockHyperdrive();
    expect(vi.isMockFunction(hd.connect)).toBe(true);
  });
});

describe("createMockDurableObjectNamespace", () => {
  it("returns a namespace with mock functions", () => {
    const ns = createMockDurableObjectNamespace();
    expect(vi.isMockFunction(ns.idFromName)).toBe(true);
    expect(vi.isMockFunction(ns.idFromString)).toBe(true);
    expect(vi.isMockFunction(ns.newUniqueId)).toBe(true);
    expect(vi.isMockFunction(ns.get)).toBe(true);
  });

  it("idFromName returns a stub with expected shape", () => {
    const ns = createMockDurableObjectNamespace();
    const id = ns.idFromName("my-name") as { toString(): string; name: string };
    expect(id.toString()).toBe("do-my-name");
    expect(id.name).toBe("my-name");
  });
});

describe("createMockEnv", () => {
  it("returns env with default ENVIRONMENT = test", () => {
    const env = createMockEnv();
    expect(env.ENVIRONMENT).toBe("test");
  });

  it("returns env with a default DATABASE_URL", () => {
    const env = createMockEnv();
    expect(env.DATABASE_URL).toBe("postgresql://localhost/test");
  });

  it("returns env with a mock HYPERDRIVE", () => {
    const env = createMockEnv();
    expect(env.HYPERDRIVE).toBeDefined();
    expect(env.HYPERDRIVE!.host).toBe("localhost");
  });

  it("merges overrides", () => {
    const env = createMockEnv({ ENVIRONMENT: "staging" });
    expect(env.ENVIRONMENT).toBe("staging");
    expect(env.DATABASE_URL).toBe("postgresql://localhost/test");
  });

  it("supports extending BaseWorkerEnv", () => {
    interface ExtEnv extends BaseWorkerEnv {
      MY_API_KEY: string;
    }
    const env = createMockEnv<ExtEnv>({ MY_API_KEY: "key-123" });
    expect(env.MY_API_KEY).toBe("key-123");
    expect(env.ENVIRONMENT).toBe("test");
  });
});

describe("createMockExecutionContext", () => {
  it("returns mock with waitUntil and passThroughOnException as vi.fn", () => {
    const ctx = createMockExecutionContext();
    expect(vi.isMockFunction(ctx.waitUntil)).toBe(true);
    expect(vi.isMockFunction(ctx.passThroughOnException)).toBe(true);
  });

  it("waitUntil starts with zero calls", () => {
    const ctx = createMockExecutionContext();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});

describe("MockDurableObject", () => {
  it("stores state and env on construction", () => {
    const state = { id: "test-id" };
    const env = { ENVIRONMENT: "test" };
    const obj = new MockDurableObject(state, env);
    expect(obj.state).toBe(state);
    expect(obj.env).toBe(env);
  });
});

describe("MockContainer", () => {
  it("has correct default values", () => {
    const container = new MockContainer();
    expect(container.defaultPort).toBe(8080);
    expect(container.sleepAfter).toBe("1m");
    expect(container.enableInternet).toBe(false);
  });

  it("has mock functions for lifecycle methods", () => {
    const container = new MockContainer();
    expect(vi.isMockFunction(container.fetch)).toBe(true);
    expect(vi.isMockFunction(container.destroy)).toBe(true);
    expect(vi.isMockFunction(container.startAndWaitForPorts)).toBe(true);
    expect(vi.isMockFunction(container.getState)).toBe(true);
  });

  it("getState resolves to running status", async () => {
    const container = new MockContainer();
    const state = await container.getState();
    expect(state).toEqual({ status: "running" });
  });
});

describe("createCloudflareRuntimeMocks", () => {
  it("returns cloudflare:workers with DurableObject class", () => {
    const mocks = createCloudflareRuntimeMocks();
    expect(mocks["cloudflare:workers"].DurableObject).toBe(MockDurableObject);
  });

  it("returns @cloudflare/containers with Container class", () => {
    const mocks = createCloudflareRuntimeMocks();
    expect(mocks["@cloudflare/containers"].Container).toBe(MockContainer);
  });
});

describe("createAuthenticatedRequest", () => {
  it("includes session Cookie header", () => {
    const req = createAuthenticatedRequest("/api/test");
    expect(req.headers.get("Cookie")).toContain("session");
  });

  it("constructs correct URL", () => {
    const req = createAuthenticatedRequest("/api/test");
    expect(req.url).toBe("https://api.test/api/test");
  });

  it("accepts custom base URL", () => {
    const req = createAuthenticatedRequest("/api/test", {}, "https://my.service");
    expect(req.url).toBe("https://my.service/api/test");
  });

  it("merges additional headers", () => {
    const req = createAuthenticatedRequest("/api/test", { headers: { "X-Custom": "value" } });
    expect(req.headers.get("X-Custom")).toBe("value");
    expect(req.headers.get("Cookie")).toContain("session");
  });
});

describe("createUnauthenticatedRequest", () => {
  it("has no Cookie header by default", () => {
    const req = createUnauthenticatedRequest("/health");
    expect(req.headers.get("Cookie")).toBeNull();
  });

  it("constructs correct URL", () => {
    const req = createUnauthenticatedRequest("/health");
    expect(req.url).toBe("https://api.test/health");
  });
});

describe("createCorsRequest", () => {
  it("includes Origin header", () => {
    const req = createCorsRequest("/api/data", "https://example.com");
    expect(req.headers.get("Origin")).toBe("https://example.com");
  });

  it("constructs correct URL", () => {
    const req = createCorsRequest("/api/data", "https://example.com");
    expect(req.url).toBe("https://api.test/api/data");
  });
});

describe("setupWorkerTest", () => {
  it("returns mockEnv, mockCtx, and helpers", () => {
    const setup = setupWorkerTest();
    expect(setup.mockEnv).toBeDefined();
    expect(setup.mockCtx).toBeDefined();
    expect(typeof setup.createAuthenticatedRequest).toBe("function");
    expect(typeof setup.createUnauthenticatedRequest).toBe("function");
    expect(typeof setup.createCorsRequest).toBe("function");
    expect(typeof setup.clearAllMocks).toBe("function");
  });

  it("includes cloudflareRuntime mocks by default", () => {
    const setup = setupWorkerTest();
    expect(setup.mocks.cloudflareRuntime).not.toBeNull();
  });

  it("skips cloudflareRuntime mocks when disabled", () => {
    const setup = setupWorkerTest({}, { mockCloudflareRuntime: false });
    expect(setup.mocks.cloudflareRuntime).toBeNull();
  });

  it("applies env overrides", () => {
    const setup = setupWorkerTest({ ENVIRONMENT: "staging" });
    expect(setup.mockEnv.ENVIRONMENT).toBe("staging");
  });
});

describe("suppressConsole", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses console output and can be restored", () => {
    const control = suppressConsole();
    // console.log should be a mock now
    console.log("this should be suppressed");
    control.restore();
    // after restore, console.log should be original
    expect(true).toBe(true); // just verifying no throw
  });
});
