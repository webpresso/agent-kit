import { type SpawnSyncReturns } from 'node:child_process';
export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export interface BrowserDoctorResult {
    ok: boolean;
    packageAvailable: boolean;
    packageVersion?: string;
    browser: BrowserName;
    executablePath?: string;
    executableExists: boolean;
    cachePath: string;
    hint?: string;
    installCommand?: string;
}
export interface BrowserOpenResult {
    ok: boolean;
    browser: BrowserName;
    requestedUrl: string;
    finalUrl?: string;
    status?: number;
    title?: string;
    errors: string[];
    hint?: string;
    installCommand?: string;
}
export interface BrowserInstallOptions {
    browser?: BrowserName;
    run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
}
export interface BrowserEnsureOptions {
    browser?: BrowserName;
    doctor?: (browser: BrowserName) => Promise<BrowserDoctorResult>;
    install?: (options: BrowserInstallOptions) => SpawnSyncReturns<string>;
    run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
}
export interface BrowserEnsureResult {
    ok: boolean;
    browser: BrowserName;
    alreadyInstalled: boolean;
    installed: boolean;
    doctor: BrowserDoctorResult;
    installResult?: {
        status: number | null;
        signal: NodeJS.Signals | null;
        stdout: string;
        stderr: string;
    };
    errors: string[];
    installCommand: string;
}
export declare function browserEnsureCommand(browser?: BrowserName): string;
export declare function browserDoctor(browser?: BrowserName): Promise<BrowserDoctorResult>;
export declare function installBrowser(options?: BrowserInstallOptions): SpawnSyncReturns<string>;
export declare function ensureBrowser(options?: BrowserEnsureOptions): Promise<BrowserEnsureResult>;
export declare function openBrowserUrl(url: string, options?: {
    browser?: BrowserName;
    headless?: boolean;
    doctor?: (browser: BrowserName) => Promise<BrowserDoctorResult>;
}): Promise<BrowserOpenResult>;
//# sourceMappingURL=runtime.d.ts.map