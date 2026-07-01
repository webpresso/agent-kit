import type { LookupAddress } from "node:dns";
export interface InternalHostCheckOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
export declare function normalizeHostname(hostname: string): string;
export declare function isInternalAddress(address: string): boolean;
export declare function resolveHostAddresses(hostname: string, options?: InternalHostCheckOptions): Promise<LookupAddress[]>;
export declare function isInternalHost(hostname: string, options?: InternalHostCheckOptions): Promise<boolean>;
//# sourceMappingURL=ip-guard.d.ts.map