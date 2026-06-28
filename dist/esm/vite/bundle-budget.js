const JS_EXTENSION_PATTERN = /\.js$/i;
const SCRIPT_SRC_PATTERN = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
const MODULEPRELOAD_HREF_PATTERN = /<link\b(?=[^>]*\brel\s*=\s*(["'])modulepreload\1)[^>]*\bhref\s*=\s*(["'])(.*?)\2[^>]*>/gi;
export function analyzeBundleBudget(options) {
    const limits = {
        maxJsAssetBytes: options.maxJsAssetBytes,
        maxHtmlEagerJsAssetBytes: options.maxHtmlEagerJsAssetBytes,
        maxHtmlEagerJsTotalBytes: options.maxHtmlEagerJsTotalBytes,
    };
    const assets = normalizeAssets(options.assets).filter((asset) => !isIgnored(asset.path, options.ignore));
    const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
    const jsAssets = assets.filter((asset) => isJavaScriptPath(asset.path));
    const htmlEagerJsReferences = options.html ? extractHtmlEagerJsReferences(options.html) : [];
    const htmlEagerJsAssets = [];
    const violations = [];
    for (const asset of jsAssets) {
        if (limits.maxJsAssetBytes !== undefined && asset.bytes > limits.maxJsAssetBytes) {
            violations.push({
                kind: "js-asset-too-large",
                path: asset.path,
                bytes: asset.bytes,
                limit: limits.maxJsAssetBytes,
                message: `${asset.path} is ${asset.bytes} bytes, above JS asset budget ${limits.maxJsAssetBytes} bytes.`,
            });
        }
    }
    for (const reference of htmlEagerJsReferences) {
        if (isIgnored(reference, options.ignore))
            continue;
        const asset = assetByPath.get(reference);
        if (!asset) {
            violations.push({
                kind: "html-referenced-asset-missing",
                path: reference,
                bytes: 0,
                message: `HTML references ${reference}, but the asset was not found in the dist directory.`,
            });
            continue;
        }
        htmlEagerJsAssets.push(asset);
        if (limits.maxHtmlEagerJsAssetBytes !== undefined &&
            asset.bytes > limits.maxHtmlEagerJsAssetBytes) {
            violations.push({
                kind: "html-eager-js-asset-too-large",
                path: asset.path,
                bytes: asset.bytes,
                limit: limits.maxHtmlEagerJsAssetBytes,
                message: `${asset.path} is ${asset.bytes} bytes, above HTML-eager JS asset budget ${limits.maxHtmlEagerJsAssetBytes} bytes.`,
            });
        }
    }
    const htmlEagerJsTotalBytes = htmlEagerJsAssets.reduce((total, asset) => total + asset.bytes, 0);
    if (limits.maxHtmlEagerJsTotalBytes !== undefined &&
        htmlEagerJsTotalBytes > limits.maxHtmlEagerJsTotalBytes) {
        violations.push({
            kind: "html-eager-js-total-too-large",
            bytes: htmlEagerJsTotalBytes,
            limit: limits.maxHtmlEagerJsTotalBytes,
            message: `HTML-eager JS total is ${htmlEagerJsTotalBytes} bytes, above budget ${limits.maxHtmlEagerJsTotalBytes} bytes.`,
        });
    }
    return {
        ok: violations.length === 0,
        assets,
        jsAssets,
        htmlEagerJsAssets,
        htmlEagerJsReferences,
        htmlEagerJsTotalBytes,
        limits,
        violations,
    };
}
export function extractHtmlEagerJsReferences(html) {
    const references = new Set();
    for (const match of html.matchAll(SCRIPT_SRC_PATTERN)) {
        const src = match[2];
        if (src)
            addJavaScriptReference(references, src);
    }
    for (const match of html.matchAll(MODULEPRELOAD_HREF_PATTERN)) {
        const href = match[3];
        if (href)
            addJavaScriptReference(references, href);
    }
    return [...references];
}
export function formatBundleBudgetReport(result) {
    const lines = [];
    lines.push(result.ok ? "✓ Bundle budget passed" : "✗ Bundle budget failed");
    lines.push("");
    lines.push("JS assets:");
    for (const asset of [...result.jsAssets].toSorted(compareAssetPath)) {
        lines.push(`  ${formatBytes(asset.bytes).padStart(10)}  ${asset.path}`);
    }
    if (!result.jsAssets.length)
        lines.push("  (none)");
    lines.push("");
    lines.push(`HTML-eager JS total: ${formatBytes(result.htmlEagerJsTotalBytes)}`);
    for (const asset of [...result.htmlEagerJsAssets].toSorted(compareAssetPath)) {
        lines.push(`  ${formatBytes(asset.bytes).padStart(10)}  ${asset.path}`);
    }
    if (!result.htmlEagerJsAssets.length)
        lines.push("  (none)");
    if (result.violations.length) {
        lines.push("");
        lines.push("Violations:");
        for (const violation of result.violations) {
            lines.push(`  - ${violation.message}`);
        }
    }
    return lines.join("\n");
}
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    const kib = bytes / 1024;
    if (kib < 1024)
        return `${kib.toFixed(1)} KiB`;
    return `${(kib / 1024).toFixed(2)} MiB`;
}
function addJavaScriptReference(references, rawReference) {
    const normalized = normalizeReferencePath(rawReference);
    if (normalized && isJavaScriptPath(normalized))
        references.add(normalized);
}
function normalizeAssets(assets) {
    return assets.map((asset) => ({
        path: normalizeReferencePath(asset.path),
        bytes: asset.bytes,
    }));
}
function normalizeReferencePath(rawPath) {
    const withoutQuery = rawPath.split(/[?#]/, 1)[0] ?? "";
    return withoutQuery.replace(/^\.?\//, "").replace(/^\//, "");
}
function isJavaScriptPath(assetPath) {
    return JS_EXTENSION_PATTERN.test(assetPath);
}
function isIgnored(assetPath, ignore) {
    if (!ignore?.length)
        return false;
    return ignore.some((pattern) => {
        if (typeof pattern === "string")
            return assetPath.includes(pattern);
        return pattern.test(assetPath);
    });
}
function compareAssetPath(left, right) {
    return left.path.localeCompare(right.path);
}
//# sourceMappingURL=bundle-budget.js.map