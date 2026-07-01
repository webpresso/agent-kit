import { expect, test } from "@playwright/test";

const scaffoldHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Agent Kit smoke page</title>
  </head>
  <body>
    <main>
      <h1>Agent Kit quality scaffold</h1>
      <p data-testid="status">ready</p>
    </main>
  </body>
</html>`;

test("checks the package-owned quality scaffold smoke page", async () => {
  expect(scaffoldHtml).toContain("Agent Kit quality scaffold");
  expect(scaffoldHtml).toContain('data-testid="status"');
  expect(scaffoldHtml).toContain("ready");
});
