/**
 * Conflict Resolution Policy Module
 *
 * Implements last-write-wins conflict resolution with audit trail
 * for git-storage operations. Critical for handling concurrent writes
 * from multiple agents or users.
 */
/**
 * ConflictResolver
 *
 * Implements last-write-wins conflict resolution strategy.
 * All resolutions are recorded in an audit log for debugging
 * and accountability.
 */
export class ConflictResolver {
    auditLog = [];
    projectId;
    constructor(config = {}) {
        this.projectId = config.projectId;
    }
    /**
     * Resolve conflicts using last-write-wins strategy
     *
     * For each conflict, the write with the latest timestamp wins.
     * All resolutions are recorded in the audit log.
     *
     * @param conflicts - Array of conflicts to resolve
     * @returns Resolution result with all resolved conflicts
     */
    resolve(conflicts) {
        const resolved = [];
        for (const conflict of conflicts) {
            const resolution = this.resolveSingleConflict(conflict);
            if (resolution) {
                resolved.push(resolution);
                this.recordAuditEntry(conflict.filePath, resolution);
            }
        }
        return {
            resolved,
            totalConflicts: conflicts.length,
            resolvedCount: resolved.length,
        };
    }
    /**
     * Get the complete audit log of all conflict resolutions
     *
     * @returns Array of all audit entries
     */
    getAuditLog() {
        return [...this.auditLog];
    }
    /**
     * Clear the audit log
     */
    clearAuditLog() {
        this.auditLog.length = 0;
    }
    /**
     * Resolve a single conflict using last-write-wins
     */
    resolveSingleConflict(conflict) {
        if (!conflict.writes.length) {
            return null;
        }
        // Sort by timestamp descending (newest first)
        const sortedWrites = [...conflict.writes].toSorted((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const winner = sortedWrites[0];
        if (!winner) {
            return null;
        }
        const losers = sortedWrites.slice(1);
        return {
            filePath: conflict.filePath,
            winningContent: winner.content,
            winningAuthor: winner.author,
            winningTimestamp: winner.timestamp,
            losingWrites: losers,
        };
    }
    /**
     * Record an audit entry for a resolution
     */
    recordAuditEntry(filePath, resolution) {
        const entry = {
            timestamp: new Date(),
            filePath,
            winner: {
                content: resolution.winningContent,
                timestamp: resolution.winningTimestamp,
                author: resolution.winningAuthor,
            },
            losers: resolution.losingWrites,
            reason: 'last-write-wins: timestamp comparison',
        };
        if (this.projectId) {
            entry.projectId = this.projectId;
        }
        this.auditLog.push(entry);
    }
}
/**
 * Factory function to create a ConflictResolver
 *
 * @param config - Optional configuration
 * @returns New ConflictResolver instance
 */
export function createConflictResolver(config) {
    return new ConflictResolver(config);
}
//# sourceMappingURL=conflict.js.map