/**
 * Conflict Resolution Policy Module
 *
 * Implements last-write-wins conflict resolution with audit trail
 * for git-storage operations. Critical for handling concurrent writes
 * from multiple agents or users.
 */
/**
 * Represents a single write attempt to a file
 */
export interface WriteInfo {
    /** Content being written */
    content: string;
    /** Timestamp of the write */
    timestamp: Date;
    /** Author/actor performing the write */
    author: string;
}
/**
 * Represents a conflict for a single file
 */
export interface ConflictInfo {
    /** Path of the conflicting file */
    filePath: string;
    /** All competing writes to this file */
    writes: WriteInfo[];
}
/**
 * Result of resolving a single conflict
 */
export interface ResolvedConflict {
    /** Path of the resolved file */
    filePath: string;
    /** Content that won the conflict */
    winningContent: string;
    /** Author whose write won */
    winningAuthor: string;
    /** Timestamp of the winning write */
    winningTimestamp: Date;
    /** All writes that lost the conflict */
    losingWrites: WriteInfo[];
}
/**
 * Result of conflict resolution for multiple files
 */
export interface ConflictResolution {
    /** All resolved conflicts */
    resolved: ResolvedConflict[];
    /** Total number of conflicts processed */
    totalConflicts: number;
    /** Number of conflicts successfully resolved */
    resolvedCount: number;
}
/**
 * Audit entry for a conflict resolution
 */
export interface ConflictAuditEntry {
    /** Timestamp when resolution occurred */
    timestamp: Date;
    /** Path of the conflicting file */
    filePath: string;
    /** The winning write */
    winner: WriteInfo;
    /** All losing writes */
    losers: WriteInfo[];
    /** Reason for the resolution decision */
    reason: string;
    /** Optional project identifier */
    projectId?: string;
}
/**
 * Configuration for the ConflictResolver
 */
export interface ConflictResolverConfig {
    /** Project identifier for audit entries */
    projectId?: string;
}
/**
 * ConflictResolver
 *
 * Implements last-write-wins conflict resolution strategy.
 * All resolutions are recorded in an audit log for debugging
 * and accountability.
 */
export declare class ConflictResolver {
    private readonly auditLog;
    private readonly projectId?;
    constructor(config?: ConflictResolverConfig);
    /**
     * Resolve conflicts using last-write-wins strategy
     *
     * For each conflict, the write with the latest timestamp wins.
     * All resolutions are recorded in the audit log.
     *
     * @param conflicts - Array of conflicts to resolve
     * @returns Resolution result with all resolved conflicts
     */
    resolve(conflicts: ConflictInfo[]): ConflictResolution;
    /**
     * Get the complete audit log of all conflict resolutions
     *
     * @returns Array of all audit entries
     */
    getAuditLog(): ConflictAuditEntry[];
    /**
     * Clear the audit log
     */
    clearAuditLog(): void;
    /**
     * Resolve a single conflict using last-write-wins
     */
    private resolveSingleConflict;
    /**
     * Record an audit entry for a resolution
     */
    private recordAuditEntry;
}
/**
 * Factory function to create a ConflictResolver
 *
 * @param config - Optional configuration
 * @returns New ConflictResolver instance
 */
export declare function createConflictResolver(config?: ConflictResolverConfig): ConflictResolver;
//# sourceMappingURL=conflict.d.ts.map