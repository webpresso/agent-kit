export interface ChunkLoadRecoveryStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export interface ChunkLoadRecoveryEvent {
    preventDefault?: () => void;
}
export interface ChunkLoadRecoveryTarget {
    addEventListener(type: "vite:preloadError", listener: (event: ChunkLoadRecoveryEvent) => void): void;
}
export interface InstallChunkLoadRecoveryOptions {
    target?: ChunkLoadRecoveryTarget;
    storage?: ChunkLoadRecoveryStorage;
    reload?: () => void;
    key?: string;
}
export declare function installChunkLoadRecovery(options?: InstallChunkLoadRecoveryOptions): boolean;
//# sourceMappingURL=chunk-load-recovery.d.ts.map