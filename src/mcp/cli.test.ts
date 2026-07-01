import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.hoisted(() => vi.fn());
const serverCloseMock = vi.hoisted(() => vi.fn());
const transportCloseMock = vi.hoisted(() => vi.fn());
const writeSentinelMock = vi.hoisted(() => vi.fn());
const deleteSentinelMock = vi.hoisted(() => vi.fn());
const isDirectEntrypointMock = vi.hoisted(() => vi.fn(() => false));
const transports = vi.hoisted(
  () =>
    [] as Array<{ close: typeof transportCloseMock; onclose?: () => void; onerror?: () => void }>,
);

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {
    onclose?: () => void;
    onerror?: () => void;
    close = transportCloseMock;
    constructor() {
      transports.push(this);
    }
  },
}));

vi.mock("#hooks/shared/direct-entrypoint", () => ({
  isDirectEntrypoint: isDirectEntrypointMock,
}));

vi.mock("#hooks/shared/mcp-sentinel", () => ({
  writeSentinel: writeSentinelMock,
  deleteSentinel: deleteSentinelMock,
}));

vi.mock("./server.js", () => ({
  createServer: vi.fn(async () => ({ connect: connectMock, close: serverCloseMock })),
}));

import { createServer } from "./server.js";
import { runStdioServer } from "./cli.js";

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

let baselineStdinEndListeners: Function[] = [];
let baselineStdinCloseListeners: Function[] = [];
let baselineSigintListeners: Function[] = [];
let baselineSigtermListeners: Function[] = [];

function removeAddedListeners(
  emitter: NodeJS.EventEmitter,
  event: string,
  baseline: Function[],
): void {
  for (const listener of emitter.listeners(event)) {
    if (!baseline.includes(listener)) emitter.removeListener(event, listener);
  }
}

beforeEach(() => {
  baselineStdinEndListeners = process.stdin.listeners("end");
  baselineStdinCloseListeners = process.stdin.listeners("close");
  baselineSigintListeners = process.listeners("SIGINT");
  baselineSigtermListeners = process.listeners("SIGTERM");
});

afterEach(() => {
  connectMock.mockReset();
  serverCloseMock.mockReset();
  transportCloseMock.mockReset();
  writeSentinelMock.mockReset();
  deleteSentinelMock.mockReset();
  isDirectEntrypointMock.mockReturnValue(false);
  transports.splice(0);
  removeAddedListeners(process.stdin, "end", baselineStdinEndListeners);
  removeAddedListeners(process.stdin, "close", baselineStdinCloseListeners);
  removeAddedListeners(process, "SIGINT", baselineSigintListeners);
  removeAddedListeners(process, "SIGTERM", baselineSigtermListeners);
});

describe("runStdioServer", () => {
  it("importing the module does not start the server when not the direct entrypoint", () => {
    expect(isDirectEntrypointMock).toHaveBeenCalled();
    expect(createServer).not.toHaveBeenCalled();
  });

  it("connects stdio transport, writes the sentinel, and shuts down on transport close", async () => {
    connectMock.mockResolvedValue(undefined);
    serverCloseMock.mockResolvedValue(undefined);
    transportCloseMock.mockResolvedValue(undefined);

    const running = runStdioServer();
    await nextTick();

    expect(createServer).toHaveBeenCalledOnce();
    expect(connectMock).toHaveBeenCalledWith(transports[0]);
    expect(writeSentinelMock).toHaveBeenCalledOnce();

    transports[0]?.onclose?.();
    await running;

    expect(deleteSentinelMock).toHaveBeenCalledOnce();
    expect(transportCloseMock).toHaveBeenCalledOnce();
    expect(serverCloseMock).toHaveBeenCalledOnce();
  });

  it("shuts down when stdin closes", async () => {
    connectMock.mockResolvedValue(undefined);
    serverCloseMock.mockResolvedValue(undefined);
    transportCloseMock.mockResolvedValue(undefined);

    const running = runStdioServer();
    await nextTick();

    (process.stdin as EventEmitter).emit("close");
    await running;

    expect(deleteSentinelMock).toHaveBeenCalledOnce();
    expect(transportCloseMock).toHaveBeenCalledOnce();
    expect(serverCloseMock).toHaveBeenCalledOnce();
  });
});
