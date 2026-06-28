/**
 * Pure detection logic for Testing Philosophy Helper (TPH) audit.
 * Zero I/O — accepts pre-read file contents, returns structured results.
 */
export const DEFAULT_MAX_MOCKS = 3;
/**
 * Infrastructure/leaf packages that are OK to mock in unit tests.
 * Mocking these is INFO (advisory), not ERROR.
 * Service/business logic mocks remain ERROR.
 */
export const INFRA_MOCK_ALLOWLIST = new Set([
    "@myorg/types",
    "@myorg/utils",
    "@myorg/urls",
    "@myorg/i18n",
    "@myorg/ui",
    "@myorg/ui/icons", // Icon component subpath — pure UI primitives, same infra tier as @myorg/ui
    "@myorg/observability",
    "@myorg/config",
    "@myorg/config/browser-env",
    "@myorg/graphql-subscriptions/react",
    "@myorg/platform-web/graphql-client",
    "@myorg/neon", // External API client (Neon DB) — boundary mock is OK
    "@myorg/ai-agent", // External AI service boundary (needs API keys for real calls)
    "@myorg/git-storage", // External file storage service boundary
    "@myorg/git-storage/git-core", // Git operations boundary
    "@myorg/blueprint/local", // File-based service (integration tests available for some)
    "@myorg/blueprint", // Blueprint utilities
    // Cloudflare Workers runtime infrastructure (not available in unit tests)
    "@sentry/cloudflare", // Sentry error tracking for Workers
    "cloudflare:workers", // Cloudflare Workers runtime (DurableObject, etc.)
    "@cloudflare/containers", // Cloudflare Container API
    // FullCalendar ecosystem (calendar component tests, heavy DOM APIs unavoidable in JSDOM)
    "@fullcalendar/react",
    "@fullcalendar/core",
    "@fullcalendar/daygrid",
    "@fullcalendar/timegrid",
    "@fullcalendar/interaction",
    // Remix/React SSR framework (entry.server, root tests, SSR context unavailable in unit tests)
    "isbot", // User agent detection for SSR
    "@react-router/node", // React Router SSR node APIs
    "react-dom/server", // React SSR rendering
    "react-router", // React Router core (when mocked for SSR entry.server tests)
    // GraphiQL ecosystem (GraphiQL modal tests, heavy Editor/CodeMirror unavoidable in JSDOM)
    "graphiql",
    "@graphiql/toolkit",
]);
/**
 * Package prefixes where all subpaths are treated as infrastructure.
 * Matches any import starting with these prefixes.
 */
const INFRA_MOCK_PREFIXES = [
    "@myorg/worker-api/", // Worker infrastructure (auth, database middleware)
    "@myorg/schema-engine/", // Build-time tooling (commands, runtime, loaders)
    "@myorg/app-core/", // App-core subpath exports (graphql-client, etc.)
    "@myorg/cli-utils/", // CLI infrastructure utilities (port management, wrangler, repo root)
    "@codemirror/", // CodeMirror ecosystem - unavoidable in JSDOM (document as 1 mock when consolidated)
    "@dnd-kit/", // Drag and drop library (sprint component tests, DOM APIs unavoidable in JSDOM)
];
/**
 * External dependencies that must be mocked due to environment constraints.
 * These are treated as infrastructure when properly documented/consolidated.
 */
const EXTERNAL_INFRA_DEPS = new Set([
    "rainbowbrackets", // CodeMirror plugin (JSDOM incompatible)
    "@replit/codemirror-minimap", // CodeMirror plugin (JSDOM incompatible)
    "@uiw/codemirror-theme-vscode", // CodeMirror theme (JSDOM incompatible)
]);
/**
 * External package prefixes treated as infrastructure.
 * Matches any import starting with these prefixes.
 */
const EXTERNAL_INFRA_PREFIXES = [
    "@opentelemetry/", // OpenTelemetry SDK - external observability boundary
    "@modelcontextprotocol/", // MCP SDK - external protocol boundary
    "@tanstack/", // TanStack ecosystem (react-query, etc.) - framework boundary
    "nuqs/", // URL state management - framework boundary
];
export function isInfraMock(mockPath) {
    // [TPH-INFRA] tagged mocks are always infrastructure
    if (mockPath.startsWith("[INFRA]")) {
        return true;
    }
    if (INFRA_MOCK_ALLOWLIST.has(mockPath)) {
        return true;
    }
    if (EXTERNAL_INFRA_DEPS.has(mockPath)) {
        return true;
    }
    if (INFRA_MOCK_PREFIXES.some((prefix) => mockPath.startsWith(prefix))) {
        return true;
    }
    if (EXTERNAL_INFRA_PREFIXES.some((prefix) => mockPath.startsWith(prefix))) {
        return true;
    }
    // Generated code (hooks, frontend nav) is infrastructure
    return mockPath.includes("/generated/");
}
/**
 * Check if a mock has [TPH-INFRA] tag in comment above it.
 * This allows marking relative-path mocks as infrastructure.
 */
function hasInfraTag(content, matchIndex) {
    // Look at previous 300 chars for [TPH-INFRA] tag (allows for longer JSDoc comments)
    const before = content.slice(Math.max(0, matchIndex - 300), matchIndex);
    return /\[TPH-INFRA\]/.test(before);
}
/**
 * Check if a mock factory replaces behavior (vi.fn, class, spy patterns)
 * vs. returning only pure data/constants.
 */
function mockHasBehavior(content, matchIndex) {
    const rest = content.slice(matchIndex);
    const factoryMatch = rest.match(/vi\.mock\([^,]+,\s*(?:async\s*)?\(\)\s*=>\s*/);
    if (!factoryMatch) {
        return true; // No factory = auto-mock, replaces everything
    }
    const bodyStart = (factoryMatch.index ?? 0) + factoryMatch[0].length;
    const bodySlice = rest.slice(bodyStart, bodyStart + 500);
    return /vi\.fn|mockResolvedValue|mockReturnValue|mockImplementation|\bclass\b/.test(bodySlice);
}
/**
 * Check if a mock path is a local/relative path (same-package mock).
 * Local mocks (./  ../  #) are excluded from over-mocking counts
 * because they mock within the same package, not across boundaries.
 */
export function isLocalMock(mockPath) {
    return (mockPath.startsWith("./") ||
        mockPath.startsWith("../") ||
        mockPath.startsWith("#") ||
        mockPath.endsWith("?url") // CSS/asset imports (e.g., './globals.css?url')
    );
}
function classifyMockPath(mockPath, hasBehavior, isTaggedInfra, result) {
    if (isTaggedInfra) {
        result.externalMocks.push({ path: `[INFRA] ${mockPath}`, hasBehavior });
    }
    else if (isLocalMock(mockPath)) {
        result.localMocks.push({ path: mockPath, hasBehavior });
    }
    else if (mockPath.startsWith("@myorg/")) {
        result.internalMocks.push({ path: mockPath, hasBehavior });
    }
    else {
        result.externalMocks.push({ path: mockPath, hasBehavior });
    }
}
function countMocks(content) {
    const matches = [...content.matchAll(/vi\.mock\(\s*['"`]([^'"`]+)['"`]/g)];
    const result = { internalMocks: [], externalMocks: [], localMocks: [] };
    for (const m of matches) {
        const path = m[1];
        const matchIndex = m.index ?? 0;
        classifyMockPath(path, mockHasBehavior(content, matchIndex), hasInfraTag(content, matchIndex), result);
    }
    return { total: matches.length, ...result };
}
export function isUnitTestFile(filePath) {
    return ((filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx")) &&
        !filePath.includes(".integration.") &&
        !filePath.includes(".workers.") &&
        !filePath.includes(".e2e."));
}
function addMockViolation(violations, rel, severity, rule, mocks, suffix) {
    if (!mocks.length) {
        return;
    }
    const paths = mocks.map((m) => m.path).join(", ");
    violations.push({ file: rel, severity, rule, message: `${paths}. ${suffix}` });
}
function classifyMocks(internalMocks) {
    return {
        serviceBehavior: internalMocks.filter((m) => !isInfraMock(m.path) && m.hasBehavior),
        serviceData: internalMocks.filter((m) => !isInfraMock(m.path) && !m.hasBehavior),
        infra: internalMocks.filter((m) => isInfraMock(m.path)),
    };
}
function detectInlineYaml(content, filePath) {
    const inlineYamlMatches = [
        ...content.matchAll(/(?:writeFileSync|writeFile)\s*\([^,]+\.yaml['"`]\s*,\s*[`'"]/g),
    ];
    for (const match of inlineYamlMatches) {
        const matchIndex = match.index ?? 0;
        const rest = content.slice(matchIndex, matchIndex + 500);
        // Skip 1-line strings (intentionally malformed YAML for error tests)
        const hasNewlines = rest.includes("\\n") ||
            (rest.includes("`") && rest.indexOf("\n") < rest.indexOf("`", rest.indexOf("`") + 1));
        if (hasNewlines) {
            return {
                file: filePath,
                severity: "ERROR",
                rule: "inline-yaml",
                message: "Inline YAML string literal detected. Use __fixtures__/*.yaml files with cpSync instead.",
            };
        }
    }
    return undefined;
}
function auditFileContents(filePath, contents, maxMocks) {
    const violations = [];
    const { total, internalMocks, externalMocks, localMocks } = countMocks(contents);
    // Classify mocks to distinguish infra from service/external mocks
    const { serviceBehavior, serviceData } = classifyMocks(internalMocks);
    // Also classify external mocks (e.g., @sentry/cloudflare, cloudflare:workers are infra)
    const externalInfra = externalMocks.filter((m) => isInfraMock(m.path));
    const externalNonInfra = externalMocks.filter((m) => !isInfraMock(m.path));
    // Local mocks (./  ../  #) and infra mocks are excluded from over-mocking count
    const problematicCount = serviceBehavior.length + serviceData.length + externalNonInfra.length;
    // Count only non-infra, non-local mocks for the over-mocking threshold
    if (problematicCount > maxMocks) {
        const excluded = localMocks.length + externalInfra.length;
        violations.push({
            file: filePath,
            severity: "WARNING",
            rule: "over-mocking",
            message: `${problematicCount} non-infra mocks (${total} total, ${excluded} local/infra excluded). Reduce service/external mocking.`,
        });
    }
    const inlineYamlViolation = detectInlineYaml(contents, filePath);
    if (inlineYamlViolation) {
        violations.push(inlineYamlViolation);
    }
    if (isUnitTestFile(filePath) && internalMocks.length > 0) {
        addMockViolation(violations, filePath, "ERROR", "service-mock-in-unit-test", serviceBehavior, "Rename to .integration.test.ts or use real dependencies.");
        addMockViolation(violations, filePath, "WARNING", "service-data-mock-in-unit-test", serviceData, "Consider importing real constants.");
        // Infra mocks in unit tests are acknowledged as OK — no need to report
    }
    return violations;
}
/**
 * Pure detection function. Takes pre-read file contents, returns structured result.
 * No readFileSync, no glob, no runShell, no root param needed.
 */
export function detectTphViolations(files, options) {
    const maxMocks = options?.maxMocks ?? DEFAULT_MAX_MOCKS;
    const violations = [];
    for (const file of files) {
        violations.push(...auditFileContents(file.path, file.contents, maxMocks));
    }
    return {
        filesChecked: files.length,
        violations,
        errorCount: violations.filter((v) => v.severity === "ERROR").length,
        warningCount: violations.filter((v) => v.severity === "WARNING").length,
        infoCount: violations.filter((v) => v.severity === "INFO").length,
    };
}
//# sourceMappingURL=audit-tph-detect.js.map