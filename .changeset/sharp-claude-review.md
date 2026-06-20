---
"@webpresso/agent-kit": patch
---

Harden Claude CLI auth and curated gstack staging after final review: avoid false-positive auth parsing, preserve diagnostics for unrecognized CLI auth status, use a safe temp file in the Claude skill auth snippet, enforce the gstack source payload budget across all source files, and record a real upstream gstack commit in provenance.
