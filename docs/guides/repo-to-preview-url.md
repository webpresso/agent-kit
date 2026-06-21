---
type: guide
last_updated: '2026-06-19'
---

# Repo checkout to preview URL

This is the intended consumer-operator path.

## 1. Install the global toolchain

```bash
vp install -g @webpresso/agent-kit
```

Keep `wp` global. Do **not** add `@webpresso/agent-kit` as a consumer-local
dependency.

## 2. Keep only the local preset dependency

Your repo keeps `@webpresso/agent-config` for local TypeScript, Vitest, and
quality presets.

## 3. Bootstrap the repo

```bash
wp setup
wp hooks doctor
```

## 4. Prove the secret contract

```bash
wp secrets doctor
```

Expected outcome: a redacted, actionable diagnosis instead of provider-specific
manual steps.

## 5. Ask for a preview

```bash
wp preview --json
```

Expected outcome:
- either a live preview URL
- or a structured JSON report with problem, cause, fix, docs URL, and redacted
  evidence

## 6. When versions drift

Align the **global** tool:

```bash
vp install -g @webpresso/agent-kit@<pinned-version>
```

Keep the repo-local dependency surface on `@webpresso/agent-config`, not
`@webpresso/agent-kit`.
