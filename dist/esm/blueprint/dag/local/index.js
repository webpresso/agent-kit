/**
 * agent-kit blueprint/dag/local
 *
 * Node.js-only DAG utilities for local CLI execution.
 * These modules use `node:fs` and `node:path` — DO NOT import in Workers bundles.
 *
 * For workers-safe DAG utilities, use the parent `dag` subpath instead.
 *
 * @packageDocumentation
 */
export { createMockPackageGraph, IndependenceDetector } from './independence.js';
// Package Graph
export { createMockFileSystem, PackageGraph, realFileSystem } from './package-graph.js';
//# sourceMappingURL=index.js.map