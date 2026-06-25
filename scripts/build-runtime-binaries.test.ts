import { describe, expect, it } from "vitest";

import { buildRuntimeCompileCommands } from "./build-runtime-binaries.js";

describe("build-runtime-binaries", () => {
  it("builds Bun compile commands for the runtime target matrix", () => {
    const commands = buildRuntimeCompileCommands({ rootDir: "/repo" });

    expect(commands.map((command) => command.target.id)).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-x64",
      "linux-arm64",
      "windows-x64",
    ]);
    expect(commands[0]!.args).toEqual([
      "build",
      "/repo/src/cli/cli.ts",
      "--compile",
      "--target",
      "bun-darwin-arm64",
      "--outfile",
      "/repo/dist/runtime/darwin-arm64/wp",
    ]);
    expect(commands.at(-1)!.outfile).toBe("/repo/dist/runtime/windows-x64/wp.exe");
  });

  it("can select one target by id", () => {
    expect(
      buildRuntimeCompileCommands({ rootDir: "/repo", selectedTarget: "linux-arm64" }).map(
        (command) => command.target.id,
      ),
    ).toEqual(["linux-arm64"]);
  });
});
