import type { CAC } from "cac";
import { browserDoctor, ensureBrowser, openBrowserUrl, type BrowserInstallOptions } from "#browser/runtime.js";
export declare const BROWSER_COMMAND_HELP = "Browser runtime helpers (doctor, ensure, install, open)";
export interface BrowserCommandDependencies {
    browserDoctor?: typeof browserDoctor;
    ensureBrowser?: typeof ensureBrowser;
    installBrowser?: (options: BrowserInstallOptions) => {
        status: number | null;
    };
    openBrowserUrl?: typeof openBrowserUrl;
}
export declare function registerBrowserCommand(cli: CAC, dependencies?: BrowserCommandDependencies): void;
//# sourceMappingURL=browser.d.ts.map