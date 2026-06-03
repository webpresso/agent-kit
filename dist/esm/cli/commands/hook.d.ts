import type { CAC } from 'cac';
declare const HOOK_NAMES: readonly ["pretool-guard", "post-tool", "stop-qa", "guard-switch", "sessionstart-routing"];
export type HookName = (typeof HOOK_NAMES)[number];
export declare function isHookName(value: string): value is HookName;
export declare function runHookCommand(name: string): Promise<void>;
export declare function registerHookCommand(cli: CAC): void;
export {};
//# sourceMappingURL=hook.d.ts.map