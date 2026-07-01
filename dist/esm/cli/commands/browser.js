import { browserDoctor, ensureBrowser, installBrowser, openBrowserUrl, } from "#browser/runtime.js";
export const BROWSER_COMMAND_HELP = "Browser runtime helpers (doctor, ensure, install, open)";
function parseBrowser(value) {
    return value === "firefox" || value === "webkit" || value === "chromium" ? value : "chromium";
}
function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function printDoctor(result) {
    console.log(`Playwright package: ${result.packageAvailable ? `✓ ${result.packageVersion ?? "installed"}` : "✗ missing"}`);
    console.log(`Browser: ${result.browser}`);
    console.log(`Executable: ${result.executableExists ? `✓ ${result.executablePath}` : "✗ missing"}`);
    console.log(`Cache: ${result.cachePath}`);
    if (result.installCommand)
        console.log(`Install: ${result.installCommand}`);
    if (result.hint)
        console.log(`Hint: ${result.hint}`);
}
function printEnsure(result) {
    if (result.alreadyInstalled) {
        console.log(`Playwright ${result.browser} already installed.`);
        return;
    }
    if (result.ok) {
        console.log(`Playwright ${result.browser} installed.`);
        return;
    }
    console.log(`Playwright ${result.browser} is not installed.`);
    console.log(`Install: ${result.installCommand}`);
    for (const error of result.errors)
        console.log(`Error: ${error}`);
}
function printOpen(result) {
    console.log(`Browser: ${result.browser}`);
    console.log(`URL: ${result.finalUrl ?? result.requestedUrl}`);
    if (result.status !== undefined)
        console.log(`Status: ${result.status}`);
    if (result.title !== undefined)
        console.log(`Title: ${result.title}`);
    if (result.installCommand)
        console.log(`Install: ${result.installCommand}`);
    if (result.hint)
        console.log(`Hint: ${result.hint}`);
    if (result.errors.length > 0) {
        console.log("Errors:");
        for (const error of result.errors)
            console.log(`  - ${error}`);
    }
}
function throwExit(message, exitCode) {
    const error = new Error(message);
    error.exitCode = exitCode;
    throw error;
}
export function registerBrowserCommand(cli, dependencies = {}) {
    const runDoctor = dependencies.browserDoctor ?? browserDoctor;
    const runEnsure = dependencies.ensureBrowser ?? ensureBrowser;
    const runInstall = dependencies.installBrowser ?? installBrowser;
    const runOpen = dependencies.openBrowserUrl ?? openBrowserUrl;
    cli
        .command("browser <action> [target]", BROWSER_COMMAND_HELP)
        .option("--browser <browser>", "Browser engine: chromium, firefox, webkit")
        .option("--headed", "Run headed instead of headless for `browser open`")
        .option("--json", "Print machine-readable JSON for `doctor`, `ensure`, and `open`")
        .action(async (action, target, flags) => {
        if (action === "doctor") {
            const result = await runDoctor(parseBrowser(flags.browser));
            if (flags.json)
                printJson(result);
            else
                printDoctor(result);
            if (!result.ok)
                throwExit("browser doctor failed", 1);
            return 0;
        }
        if (action === "ensure") {
            const result = await runEnsure({ browser: parseBrowser(target ?? flags.browser) });
            if (flags.json)
                printJson(result);
            else
                printEnsure(result);
            if (!result.ok)
                throwExit("browser ensure failed", 1);
            return 0;
        }
        if (action === "install") {
            const result = runInstall({ browser: parseBrowser(target ?? flags.browser) });
            return typeof result.status === "number" ? result.status : 1;
        }
        if (action === "open") {
            if (!target)
                throwExit("browser open requires a URL", 1);
            const result = await runOpen(target, {
                browser: parseBrowser(flags.browser),
                headless: flags.headed !== true,
            });
            if (flags.json)
                printJson(result);
            else
                printOpen(result);
            if (!result.ok)
                throwExit("browser open failed", 1);
            return 0;
        }
        throwExit(`unknown browser action: ${action}`, 1);
    });
}
//# sourceMappingURL=browser.js.map