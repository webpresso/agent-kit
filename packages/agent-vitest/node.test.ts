import { describe, expect, it } from "vitest";

import { createNodeProjects } from "./node";

describe("createNodeProjects", () => {
  it("applies runner overrides to every generated project", () => {
    const projects = createNodeProjects("example", {
      fileParallelism: false,
      isolate: false,
      maxWorkers: 1,
    });

    const testConfigs = projects.map((project) => project.test);

    expect(testConfigs).toHaveLength(2);
    expect(testConfigs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileParallelism: false,
          isolate: false,
          maxWorkers: 1,
          name: "example/unit",
        }),
        expect.objectContaining({
          fileParallelism: false,
          isolate: false,
          maxWorkers: 1,
          name: "example/integration",
        }),
      ]),
    );
  });
});
