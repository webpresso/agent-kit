/**
 * Interfaces for graph analysis results.
 */

/**
 * Validation result for graph analysis.
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Graph statistics for analysis.
 */
export interface GraphStats {
  nodeCount: number
  edgeCount: number
  maxDepth: number
  maxWidth: number
  waveCount: number
  hasCycles: boolean
  isolatedNodes: string[]
}
