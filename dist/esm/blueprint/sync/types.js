/**
 * BlueprintPlatformClient — public OSS boundary between agent-kit and the
 * private webpresso platform-api.
 *
 * Platform team implements this interface; agent-kit ships the types.
 * The platform URL is injected at runtime via `AK_BLUEPRINT_PLATFORM_URL`.
 *
 * Design decisions (resolved 2026-05-12, platform team design session):
 *  Q1: Buffer locally, push on reconnect. `eventId` provides idempotency.
 *  Q2: OAuth device flow; token injected as `getToken()` at construction.
 *  Q3: 30s replica TTL; consumer calls `getSnapshot()` when TTL expires.
 *  Q4: No markdown — platform is canonical; only structured data.
 *  Q5: GitHub-hosted templates; `listTemplates()` reads from a GitHub URL.
 *  Q6: Types + client in agent-kit (OSS); implementation in monorepo.
 *  Q7: Import existing blueprints on first auth via `pushEvent` bulk call.
 */
export {};
//# sourceMappingURL=types.js.map