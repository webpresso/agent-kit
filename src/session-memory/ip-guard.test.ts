import { lookup } from "node:dns/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { isInternalHost } from "./ip-guard.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    switch (hostname) {
      case "docs.example.com":
      case "example.com":
        return [{ address: "93.184.216.34", family: 4 }];
      case "private.example.com":
        return [{ address: "10.0.0.8", family: 4 }];
      case "mixed.example.com":
        return [
          { address: "93.184.216.34", family: 4 },
          { address: "169.254.169.254", family: 4 },
        ];
      default:
        throw new Error(`unexpected dns lookup for ${hostname}`);
    }
  }),
}));

const lookupMock = vi.mocked(lookup);

afterEach(() => {
  lookupMock.mockClear();
});

describe("isInternalHost", () => {
  it.each([
    "169.254.169.254",
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "100.64.0.1",
    "198.18.0.1",
    "198.51.100.10",
    "203.0.113.10",
    "192.0.0.8",
    "192.0.2.8",
    "0.0.0.0",
    "::",
    "::1",
    "[::1]",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "2001:db8::1",
    "2002:0a00:0001::",
    "64:ff9b::a00:1",
    "64:ff9b:1::1",
    "100::1",
    "2001:2::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "[::ffff:7f00:1]",
    "::ffff:a9fe:a9fe",
    "::ffff:6440:1",
    "::ffff:c612:1",
    "localhost",
    "localhost.",
    "printer.local",
    "service.internal",
  ])("blocks internal literal or local host %s without DNS lookup", async (hostname) => {
    await expect(isInternalHost(hostname)).resolves.toBe(true);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each(["8.8.8.8", "2001:4860:4860::8888"])("allows public literal IP %s", async (hostname) => {
    await expect(isInternalHost(hostname)).resolves.toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("allows a hostname whose DNS answers are all public", async () => {
    await expect(isInternalHost("example.com")).resolves.toBe(false);
    expect(lookupMock).toHaveBeenCalledWith("example.com", { all: true });
  });

  it.each(["private.example.com", "mixed.example.com"])(
    "blocks %s when any DNS answer is internal",
    async (hostname) => {
      await expect(isInternalHost(hostname)).resolves.toBe(true);
    },
  );

  it("fails closed when DNS lookup fails", async () => {
    await expect(isInternalHost("missing.example.com")).resolves.toBe(true);
  });
});
