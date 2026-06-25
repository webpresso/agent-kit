import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs");

import { closeSync, openSync } from "node:fs";

describe("suppressStderr", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("calls closeSync(2) and openSync /dev/null on non-win32", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    vi.mocked(closeSync).mockReturnValue(undefined);
    vi.mocked(openSync).mockReturnValue(2);

    const { suppressStderr } = await import("#hooks/shared/hook-bootstrap");
    suppressStderr();

    expect(vi.mocked(closeSync)).toHaveBeenCalledWith(2);
    expect(vi.mocked(openSync)).toHaveBeenCalledWith("/dev/null", "w");
  });

  it("is a no-op on win32", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });

    const { suppressStderr } = await import("#hooks/shared/hook-bootstrap");
    suppressStderr();

    expect(vi.mocked(closeSync)).not.toHaveBeenCalled();
    expect(vi.mocked(openSync)).not.toHaveBeenCalled();
  });

  it("does not throw when closeSync throws (fd already closed)", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    vi.mocked(closeSync).mockImplementation(() => {
      throw new Error("EBADF");
    });

    const { suppressStderr } = await import("#hooks/shared/hook-bootstrap");
    expect(() => suppressStderr()).not.toThrow();
  });
});

describe("runHook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      stdout: { write: vi.fn() },
      exit: vi.fn(),
      stdin: null, // overridden per test
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  function makeStdin(content: string) {
    const { Readable } = require("node:stream") as typeof import("node:stream");
    return Readable.from([Buffer.from(content)]);
  }

  it("handler returns non-null → formatter result written to stdout", async () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      stdout: { write: vi.fn() },
      exit: vi.fn(),
      stdin: makeStdin('{"tool_name":"Bash"}'),
    });
    vi.mocked(closeSync).mockReturnValue(undefined);
    vi.mocked(openSync).mockReturnValue(2);

    const { runHook } = await import("#hooks/shared/hook-bootstrap");
    await runHook(
      (_input) => ({ decision: "deny" }),
      (result) => JSON.stringify(result),
    );

    expect(process.stdout.write).toHaveBeenCalledWith('{"decision":"deny"}');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("handler returns value → formatter is called and output written", async () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      stdout: { write: vi.fn() },
      exit: vi.fn(),
      stdin: makeStdin('{"tool_name":"Bash"}'),
    });
    vi.mocked(closeSync).mockReturnValue(undefined);
    vi.mocked(openSync).mockReturnValue(2);

    const { runHook } = await import("#hooks/shared/hook-bootstrap");
    await runHook(
      (_input) => ({ decision: "deny", reason: "use wp_test" }),
      (result) => JSON.stringify({ hookSpecificOutput: result }),
    );

    expect(process.stdout.write).toHaveBeenCalledWith(
      '{"hookSpecificOutput":{"decision":"deny","reason":"use wp_test"}}',
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("handler returns null → writes {} (passthrough)", async () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      stdout: { write: vi.fn() },
      exit: vi.fn(),
      stdin: makeStdin('{"tool_name":"Bash"}'),
    });
    vi.mocked(closeSync).mockReturnValue(undefined);
    vi.mocked(openSync).mockReturnValue(2);

    const { runHook } = await import("#hooks/shared/hook-bootstrap");
    await runHook(
      (_input) => null,
      (_result: never) => "{}",
    );

    expect(process.stdout.write).toHaveBeenCalledWith("{}");
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("empty stdin → writes {} and exits", async () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      stdout: { write: vi.fn() },
      exit: vi.fn(),
      stdin: makeStdin(""),
    });
    vi.mocked(closeSync).mockReturnValue(undefined);
    vi.mocked(openSync).mockReturnValue(2);

    const { runHook } = await import("#hooks/shared/hook-bootstrap");
    await runHook(
      (_input) => ({ decision: "deny" }),
      (result) => JSON.stringify(result),
    );

    expect(process.stdout.write).toHaveBeenCalledWith("{}");
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("invalid JSON stdin → writes {} and exits gracefully", async () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "linux",
      stdout: { write: vi.fn() },
      exit: vi.fn(),
      stdin: makeStdin("not-valid-json"),
    });
    vi.mocked(closeSync).mockReturnValue(undefined);
    vi.mocked(openSync).mockReturnValue(2);

    const { runHook } = await import("#hooks/shared/hook-bootstrap");
    await runHook(
      (_input) => ({ decision: "deny" }),
      (result) => JSON.stringify(result),
    );

    expect(process.stdout.write).toHaveBeenCalledWith("{}");
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
