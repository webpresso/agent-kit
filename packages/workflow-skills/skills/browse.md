---
name: browse
description: |
  Agent-controlled browser/page inspection using Webpresso's Playwright runtime. Use to open pages, inspect DOM/console/network basics, capture screenshots, and summarize findings.
license: MIT
---

# Browse

Use `wp browser doctor` first if browser availability is unknown; if it reports a missing browser, run `wp browser ensure chromium`. Prefer repo-local preview or dev-server URLs; if none are discoverable, ask for a URL.

## Read-only inspection

1. Identify the URL and whether headed or headless mode is needed.
2. Use `wp browser open <url> --json` for a lightweight smoke snapshot, or a project Playwright test for deeper flows.
3. Report URL, title, status evidence, console/page errors when available, and any screenshots/artifacts.
4. Do not mutate app data unless the user explicitly asks for a mutating browser flow.
