---
'@webpresso/agent-kit': patch
---

Fix GitHub Actions auth-preflight package probes so CI and release jobs verify package registry access without requiring an existing latest package version, and grant the preflight job explicit package-read permissions.
