import { describe, expect, it } from "vitest";

import * as wpExtension from "./index.js";

describe("@webpresso/agent-kit/wp-extension export surface", () => {
  it("exposes exactly the documented runtime helpers", () => {
    expect(Object.keys(wpExtension).sort()).toEqual([
      "isWpExtensionV1",
      "loadWpExtensions",
      "resolveAcceptedExtensionAliases",
    ]);
  });

  it("exports the extension loader helpers as functions", () => {
    expect(typeof wpExtension.isWpExtensionV1).toBe("function");
    expect(typeof wpExtension.loadWpExtensions).toBe("function");
    expect(typeof wpExtension.resolveAcceptedExtensionAliases).toBe("function");
  });
});
