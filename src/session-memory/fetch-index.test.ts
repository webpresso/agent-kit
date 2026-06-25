import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchIndexError, fetchAndIndex as fetchAndIndexProduction } from "./fetch-index.js";
import { isInternalAddress, isInternalHost, resolveHostAddresses } from "./ip-guard.js";
import { SessionMemoryStore } from "./store.js";

const { internalHosts } = vi.hoisted(() => ({
  internalHosts: new Set([
    "169.254.169.254",
    "127.0.0.1",
    "localhost",
    "192.168.1.1",
    "private.example.com",
    "[::ffff:7f00:1]",
    "[::ffff:a9fe:a9fe]",
    "100.64.0.1",
    "198.18.0.1",
    "198.51.100.10",
    "203.0.113.10",
    "192.0.2.8",
  ]),
}));

vi.mock("./ip-guard.js", () => ({
  isInternalAddress: vi.fn((address: string) => internalHosts.has(address)),
  isInternalHost: vi.fn(async (hostname: string) => internalHosts.has(hostname)),
  normalizeHostname: vi.fn((hostname: string) => hostname.replace(/^\[|\]$/gu, "").toLowerCase()),
  resolveHostAddresses: vi.fn(async (hostname: string) => [
    {
      address: internalHosts.has(hostname) ? hostname : "93.184.216.34",
      family: hostname.includes(":") ? 6 : 4,
    },
  ]),
}));

const isInternalAddressMock = vi.mocked(isInternalAddress);
const isInternalHostMock = vi.mocked(isInternalHost);
const resolveHostAddressesMock = vi.mocked(resolveHostAddresses);

function fetchAndIndex(
  options: Parameters<typeof fetchAndIndexProduction>[0] & {
    fetchImpl?: typeof fetch;
    allowedHosts?: readonly string[];
  },
): ReturnType<typeof fetchAndIndexProduction> {
  const { fetchImpl, allowedHosts, ...fetchOptions } = options;
  return fetchAndIndexProduction(fetchOptions, { fetchImpl, allowedHosts });
}

const dirs: string[] = [];
function store(): SessionMemoryStore {
  const dir = mkdtempSync(join(tmpdir(), "ak-fetch-index-"));
  dirs.push(dir);
  return new SessionMemoryStore(join(dir, "memory.sqlite"));
}
function response(body: string, contentType: string, init: ResponseInit = {}): Response {
  return new Response(body, { ...init, headers: { "content-type": contentType, ...init.headers } });
}
function cancellableResponse(
  body: string,
  contentType: string,
  init: ResponseInit = {},
): { response: Response; cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn();
  const encoded = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
    },
    cancel,
  });
  return {
    response: new Response(stream, {
      ...init,
      headers: { "content-type": contentType, ...init.headers },
    }),
    cancel,
  };
}

afterEach(() => {
  isInternalAddressMock.mockClear();
  isInternalHostMock.mockClear();
  resolveHostAddressesMock.mockClear();
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("fetchAndIndex", () => {
  it("rejects internal metadata URLs before fetching", async () => {
    const s = store();
    const fetchImpl = vi.fn(async () => response("metadata", "text/plain"));

    await expect(
      fetchAndIndex({
        url: "http://169.254.169.254/latest/meta-data/",
        store: s,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "blocked_host" });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(s.count()).toBe(0);
    s.close();
  });

  it.each(["http://127.0.0.1/", "http://localhost/", "http://192.168.1.1/"])(
    "rejects internal URL %s by default",
    async (url) => {
      const s = store();
      await expect(
        fetchAndIndex({
          url,
          store: s,
          fetchImpl: vi.fn(async () => response("blocked", "text/plain")),
        }),
      ).rejects.toMatchObject({ code: "blocked_host" });
      expect(s.count()).toBe(0);
      s.close();
    },
  );

  it.each([
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://198.51.100.10/",
    "http://203.0.113.10/",
    "http://192.0.2.8/",
  ])("rejects canonical internal or special-use URL %s before fetching", async (url) => {
    const s = store();
    const fetchImpl = vi.fn(async () => response("blocked", "text/plain"));
    await expect(fetchAndIndex({ url, store: s, fetchImpl })).rejects.toMatchObject({
      code: "blocked_host",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(s.count()).toBe(0);
    s.close();
  });

  it("rejects hostnames that resolve to private addresses by default", async () => {
    const s = store();
    await expect(
      fetchAndIndex({
        url: "https://private.example.com/docs",
        store: s,
        fetchImpl: vi.fn(async () => response("private docs", "text/plain")),
      }),
    ).rejects.toMatchObject({ code: "blocked_host" });
    expect(s.count()).toBe(0);
    s.close();
  });

  it("rejects redirects to internal hosts before following them", async () => {
    const s = store();
    const fetchImpl = vi.fn(async () =>
      response("", "text/plain", {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );

    await expect(
      fetchAndIndex({
        url: "https://example.com/redirect",
        store: s,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "blocked_host" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(isInternalHostMock).toHaveBeenCalledWith("169.254.169.254", expect.any(Object));
    expect(s.count()).toBe(0);
    s.close();
  });

  it("cancels redirect response bodies before following the next hop", async () => {
    const s = store();
    const redirected = cancellableResponse("redirect body", "text/plain", {
      status: 302,
      headers: { location: "https://example.com/final" },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirected.response)
      .mockResolvedValueOnce(response("final docs", "text/plain"));

    const chunks = await fetchAndIndex({
      url: "https://example.com/redirect",
      store: s,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(redirected.cancel).toHaveBeenCalledTimes(1);
    expect(chunks).toHaveLength(1);
    s.close();
  });

  it("rejects native fetches when DNS resolution returns an internal address", async () => {
    const s = store();
    resolveHostAddressesMock.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);

    await expect(
      fetchAndIndex({
        url: "https://rebind.example.com/docs",
        store: s,
      }),
    ).rejects.toMatchObject({ code: "blocked_host" });

    expect(resolveHostAddressesMock).toHaveBeenCalledWith("rebind.example.com", expect.any(Object));
    expect(s.count()).toBe(0);
    s.close();
  });

  it("does not expose an internal-host allowlist escape hatch", async () => {
    const s = store();
    const fetchImpl = vi.fn(async () => response("local docs", "text/plain"));

    await expect(
      fetchAndIndex({
        url: "http://localhost/path",
        store: s,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "blocked_host" });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(s.count()).toBe(0);
    s.close();
  });

  it("keeps the loopback allowlist behind internal dependency injection only", async () => {
    const s = store();
    const fetchImpl = vi.fn(async () => response("local docs", "text/plain"));

    const chunks = await fetchAndIndex({
      url: "http://localhost/path",
      store: s,
      fetchImpl,
      allowedHosts: ["localhost"],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(chunks[0]?.text).toContain("local docs");
    expect(s.count()).toBe(1);
    s.close();
  });

  it("fetches HTML, converts it to markdown-ish chunks, and indexes it", async () => {
    const s = store();
    await fetchAndIndex({
      url: "https://example.com/a#frag",
      store: s,
      fetchImpl: vi.fn(async () => response("<h1>Hello</h1><p>session memory</p>", "text/html")),
    });
    expect(s.search({ query: "session", limit: 1 })[0]?.text).toContain("session memory");
    s.close();
  });

  it("fetches JSON as structured chunks and indexes it", async () => {
    const s = store();
    await fetchAndIndex({
      url: "https://example.com/data",
      store: s,
      fetchImpl: vi.fn(async () => response('{"name":"memory"}', "application/json")),
    });
    expect(s.search({ query: "memory", limit: 1 })[0]?.text).toContain("memory");
    s.close();
  });

  it("fetches text without a network cache", async () => {
    const s = store();
    const fetchImpl = vi.fn(async () => response("fresh memory", "text/plain"));
    await fetchAndIndex({ url: "https://example.com/cache#one", store: s, fetchImpl, now: 10 });
    await fetchAndIndex({ url: "https://example.com/cache#two", store: s, fetchImpl, now: 20 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    s.close();
  });

  it("passes an AbortSignal to native fetch-compatible implementations", async () => {
    const s = store();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return response("timeout-aware memory", "text/plain");
    });
    await fetchAndIndex({ url: "https://example.com/signal", store: s, fetchImpl, timeoutMs: 1 });
    s.close();
  });

  it("rejects invalid URLs without indexing", async () => {
    const s = store();
    await expect(
      fetchAndIndex({ url: "file:///tmp/body", store: s, fetchImpl: vi.fn() }),
    ).rejects.toMatchObject({ code: "invalid_url" });
    expect(s.count()).toBe(0);
    s.close();
  });

  it("rejects non-2xx responses without indexing", async () => {
    const s = store();
    const missing = cancellableResponse("not found raw body", "text/plain", { status: 404 });
    await expect(
      fetchAndIndex({
        url: "https://example.com/missing",
        store: s,
        fetchImpl: vi.fn(async () => missing.response),
      }),
    ).rejects.toMatchObject({ code: "http_error", status: 404 });
    expect(missing.cancel).toHaveBeenCalledTimes(1);
    expect(s.count()).toBe(0);
    s.close();
  });

  it("rejects malformed JSON without indexing", async () => {
    const s = store();
    await expect(
      fetchAndIndex({
        url: "https://example.com/bad-json",
        store: s,
        fetchImpl: vi.fn(async () => response("{bad", "application/json")),
      }),
    ).rejects.toMatchObject({ code: "invalid_json" });
    expect(s.count()).toBe(0);
    s.close();
  });

  it("returns no chunks for empty normalized content without indexing", async () => {
    const s = store();
    const chunks = await fetchAndIndex({
      url: "https://example.com/empty",
      store: s,
      fetchImpl: vi.fn(async () => response("   ", "text/plain")),
    });
    expect(chunks).toEqual([]);
    expect(s.count()).toBe(0);
    s.close();
  });

  it("enforces a bounded response body before indexing", async () => {
    const s = store();
    const large = cancellableResponse("this body is too large", "text/plain");
    await expect(
      fetchAndIndex({
        url: "https://example.com/large",
        store: s,
        maxBytes: 8,
        fetchImpl: vi.fn(async () => large.response),
      }),
    ).rejects.toMatchObject({ code: "body_too_large" });
    expect(large.cancel).toHaveBeenCalledTimes(1);
    expect(s.count()).toBe(0);
    s.close();
  });

  it("maps timeout/abort to deterministic errors and leaves store unchanged", async () => {
    const s = store();
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    await expect(
      fetchAndIndex({ url: "https://example.com/slow", store: s, fetchImpl, timeoutMs: 1 }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof FetchIndexError && error.code === "timed_out",
    );
    expect(s.count()).toBe(0);
    s.close();
  });
});
