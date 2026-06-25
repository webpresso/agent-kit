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
export class ConflictResolver {
  private readonly auditLog: ConflictAuditEntry[] = [];
  private readonly projectId?: string;

  constructor(config: ConflictResolverConfig = {}) {
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
  resolve(conflicts: ConflictInfo[]): ConflictResolution {
    const resolved: ResolvedConflict[] = [];

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
  getAuditLog(): ConflictAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear the audit log
   */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /**
   * Resolve a single conflict using last-write-wins
   */
  private resolveSingleConflict(conflict: ConflictInfo): ResolvedConflict | null {
    if (!conflict.writes.length) {
      return null;
    }

    // Sort by timestamp descending (newest first)
    const sortedWrites = [...conflict.writes].toSorted(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

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
  private recordAuditEntry(filePath: string, resolution: ResolvedConflict): void {
    const entry: ConflictAuditEntry = {
      timestamp: new Date(),
      filePath,
      winner: {
        content: resolution.winningContent,
        timestamp: resolution.winningTimestamp,
        author: resolution.winningAuthor,
      },
      losers: resolution.losingWrites,
      reason: "last-write-wins: timestamp comparison",
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
export function createConflictResolver(config?: ConflictResolverConfig): ConflictResolver {
  return new ConflictResolver(config);
}
