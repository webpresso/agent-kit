export type SharedTestType = 'e2e' | 'integration' | 'unit' | 'worker';
export declare const WORKER_SIGNATURES: readonly ["cloudflare:test", "wrangler", "@cloudflare/vitest-pool-workers"];
export declare const INTEGRATION_SIGNATURES: readonly ["@webpresso/database", "@electric-sql/pglite", "drizzle-orm", "postgres", "pg", "@neondatabase/serverless", "testcontainers", "test-containers", "docker", "startTransaction", "supertest", "fastify", "@fastify/", "node:child_process", "child_process", "node:fs/promises", "execa", "@webpresso/test-utils/pglite"];
export declare function hasWorkerSignature(content: string): boolean;
export declare function hasIntegrationSignature(content: string): boolean;
export declare function classifyTestFile(filePath: string, content: string): SharedTestType;
//# sourceMappingURL=test-classification.d.ts.map