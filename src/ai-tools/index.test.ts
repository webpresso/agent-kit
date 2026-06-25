import { describe, expect, it } from "vitest";

import { listFilesTool, readFileTool, searchFilesTool, writeFileTool } from "./index.js";

describe("ai-tools index", () => {
  it("exports the file tools", () => {
    expect(readFileTool.name).toBe("read_file");
    expect(writeFileTool.name).toBe("write_file");
    expect(listFilesTool.name).toBe("list_files");
    expect(searchFilesTool.name).toBe("search_files");
  });
});
