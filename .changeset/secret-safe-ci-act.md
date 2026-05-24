---
"@webpresso/agent-kit": patch
---

Make the `wp ci act` and `wp_ci_act` surfaces secret-safe by construction: route execution through the provider-neutral secret gate, remove public unsafe act inputs, redact internal secret-file metadata, and bound captured secret-gate output.
