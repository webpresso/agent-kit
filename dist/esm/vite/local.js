import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { analyzeBundleBudget, formatBundleBudgetReport } from './bundle-budget.js';
export function analyzeViteDistBundleBudget(options) {
    const distDir = path.resolve(options.distDir);
    const htmlEntry = options.htmlEntry ?? 'index.html';
    const htmlPath = path.join(distDir, htmlEntry);
    if (!existsSync(distDir)) {
        throw new Error(`Dist directory does not exist: ${distDir}`);
    }
    if (!existsSync(htmlPath)) {
        throw new Error(`HTML entry does not exist: ${htmlPath}`);
    }
    const assets = readDistAssets(distDir);
    const html = readFileSync(htmlPath, 'utf-8');
    const analysisOptions = {
        assets,
        html,
        ignore: options.ignore,
        maxHtmlEagerJsAssetBytes: options.maxHtmlEagerJsAssetBytes,
        maxHtmlEagerJsTotalBytes: options.maxHtmlEagerJsTotalBytes,
        maxJsAssetBytes: options.maxJsAssetBytes,
    };
    return analyzeBundleBudget(analysisOptions);
}
export function parseBundleBudgetCliArgs(argv) {
    const parsed = {
        distDir: 'dist',
        htmlEntry: 'index.html',
        ignore: [],
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === undefined)
            continue;
        const next = argv[index + 1];
        switch (arg) {
            case '--dist':
            case '-d': {
                parsed.distDir = requireValue(arg, next);
                index++;
                break;
            }
            case '--html-entry': {
                parsed.htmlEntry = requireValue(arg, next);
                index++;
                break;
            }
            case '--max-js-asset-bytes': {
                parsed.maxJsAssetBytes = parseByteLimit(arg, next);
                index++;
                break;
            }
            case '--max-html-eager-js-asset-bytes': {
                parsed.maxHtmlEagerJsAssetBytes = parseByteLimit(arg, next);
                index++;
                break;
            }
            case '--max-html-eager-js-total-bytes': {
                parsed.maxHtmlEagerJsTotalBytes = parseByteLimit(arg, next);
                index++;
                break;
            }
            case '--ignore': {
                parsed.ignore = [...parsed.ignore, requireValue(arg, next)];
                index++;
                break;
            }
            case '--help':
            case '-h': {
                throw new Error(bundleBudgetCliHelp());
            }
            default: {
                if (arg.startsWith('-'))
                    throw new Error(`Unknown bundle-budget option: ${arg}`);
                parsed.distDir = arg;
            }
        }
    }
    return parsed;
}
export async function runBundleBudgetCli(argv = process.argv.slice(2)) {
    try {
        const options = parseBundleBudgetCliArgs(argv);
        const result = analyzeViteDistBundleBudget(options);
        console.log(formatBundleBudgetReport(result));
        return result.ok ? 0 : 1;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        return message === bundleBudgetCliHelp() ? 0 : 1;
    }
}
export function bundleBudgetCliHelp() {
    return [
        'Usage: ak audit bundle-budget [dist] [options]',
        '',
        'Options:',
        '  -d, --dist <dir>                                  Built Vite dist directory (default: dist)',
        '  --html-entry <file>                               HTML entry relative to dist (default: index.html)',
        '  --max-js-asset-bytes <bytes>                      Max size for any generated JS asset',
        '  --max-html-eager-js-asset-bytes <bytes>           Max size for any JS asset referenced by HTML',
        '  --max-html-eager-js-total-bytes <bytes>           Max total size for JS assets referenced by HTML',
        '  --ignore <substring>                              Ignore matching asset path; repeatable',
    ].join('\n');
}
function readDistAssets(distDir) {
    const assets = [];
    function visit(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(absolutePath);
                continue;
            }
            if (!entry.isFile())
                continue;
            const relativePath = path.relative(distDir, absolutePath).split(path.sep).join('/');
            assets.push({ path: relativePath, bytes: statSync(absolutePath).size });
        }
    }
    visit(distDir);
    return assets;
}
function requireValue(option, value) {
    if (!value || value.startsWith('-'))
        throw new Error(`Missing value for ${option}`);
    return value;
}
function parseByteLimit(option, value) {
    const rawValue = requireValue(option, value);
    const bytes = Number(rawValue);
    if (!Number.isInteger(bytes) || bytes < 0) {
        throw new Error(`${option} must be a non-negative integer number of bytes, got ${rawValue}`);
    }
    return bytes;
}
//# sourceMappingURL=local.js.map