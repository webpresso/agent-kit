import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { fetchAndIndex } from "./fetch-index.js";
import { SessionMemoryStore } from "./store.js";

const dirs: string[] = [];
const servers: Server[] = [];

function store(): SessionMemoryStore {
  const dir = mkdtempSync(join(tmpdir(), "ak-fetch-index-native-"));
  dirs.push(dir);
  return new SessionMemoryStore(join(dir, "memory.sqlite"));
}

async function serve(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: (path?: string) => string }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    url: (path = "/") => `http://127.0.0.1:${address.port}${path}`,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("fetchAndIndex native fetch path", () => {
  it("indexes through the native pinned-IP HTTP path with bounded default headers", async () => {
    const seenHeaders: Array<{ host?: string; userAgent?: string; accept?: string }> = [];
    const server = await serve((request, response) => {
      seenHeaders.push({
        host: request.headers.host,
        userAgent: request.headers["user-agent"],
        accept: request.headers.accept,
      });
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<h1>Native</h1><p>pinned address fetch</p>");
    });
    const s = store();

    const chunks = await fetchAndIndex(
      { url: server.url("/page"), store: s },
      { allowedHosts: ["127.0.0.1"] },
    );

    expect(chunks).toHaveLength(1);
    expect(s.search({ query: "pinned", limit: 1 })[0]?.text).toContain("pinned address fetch");
    expect(seenHeaders[0]?.host).toMatch(/^127\.0\.0\.1:\d+$/u);
    expect(seenHeaders[0]?.userAgent).toBe("webpresso-agent-kit/session-fetch-index");
    expect(seenHeaders[0]?.accept).toContain("text/html");
    s.close();
  });

  it("revalidates native redirects before following the next hop", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(302, {
        location: "http://169.254.169.254/latest/meta-data/",
        "content-type": "text/plain",
      });
      response.end("redirect");
    });
    const s = store();

    await expect(
      fetchAndIndex({ url: server.url("/redirect"), store: s }, { allowedHosts: ["127.0.0.1"] }),
    ).rejects.toMatchObject({ code: "blocked_host" });
    expect(s.count()).toBe(0);
    s.close();
  });

  it("enforces body limits on the native response stream before indexing", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.write("this body is ");
      response.end("too large");
    });
    const s = store();

    await expect(
      fetchAndIndex(
        { url: server.url("/large"), store: s, maxBytes: 8 },
        { allowedHosts: ["127.0.0.1"] },
      ),
    ).rejects.toMatchObject({ code: "body_too_large" });
    expect(s.count()).toBe(0);
    s.close();
  });
});
