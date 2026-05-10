import path from 'node:path';
export const WORKER_SIGNATURES = [
    'cloudflare:test',
    'wrangler',
    '@cloudflare/vitest-pool-workers',
];
export const INTEGRATION_SIGNATURES = [
    '@webpresso/database',
    '@electric-sql/pglite',
    'drizzle-orm',
    'postgres',
    'pg',
    '@neondatabase/serverless',
    'testcontainers',
    'test-containers',
    'docker',
    'startTransaction',
    'supertest',
    'fastify',
    '@fastify/',
    'node:child_process',
    'child_process',
    'node:fs/promises',
    'execa',
    '@webpresso/test-utils/pglite',
];
function lineMatchesSignature(importLine, signatures) {
    return signatures.some((sig) => importLine.includes(`from '${sig}'`) || importLine.includes(`from "${sig}"`));
}
function hasSignature(content, signatures) {
    return content
        .split('\n')
        .some((line) => line.trimStart().startsWith('import ') && lineMatchesSignature(line, signatures));
}
export function hasWorkerSignature(content) {
    return hasSignature(content, WORKER_SIGNATURES);
}
export function hasIntegrationSignature(content) {
    return hasSignature(content, INTEGRATION_SIGNATURES);
}
function isE2EPath(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.includes('/e2e/lib/') ||
        normalized.includes('/e2e/scripts/') ||
        normalized.includes('/e2e/src/')) {
        return false;
    }
    return normalized.includes('/e2e/');
}
function isE2E(filePath, content) {
    if (isE2EPath(filePath))
        return true;
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.e2e.test.ts') ||
        fileName.endsWith('.e2e.test.tsx') ||
        fileName.endsWith('.e2e.ts')) {
        return true;
    }
    return /^import .* from ['"]@playwright\/test['"]/m.test(content);
}
function isWorker(filePath, content) {
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.workers.test.ts') || fileName.endsWith('.workers.test.tsx'))
        return true;
    if (fileName.endsWith('.miniflare.test.ts') || fileName.endsWith('.miniflare.test.tsx'))
        return true;
    return hasWorkerSignature(content);
}
function isIntegration(filePath, content) {
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.integration.test.ts') || fileName.endsWith('.integration.test.tsx')) {
        return true;
    }
    return hasIntegrationSignature(content);
}
export function classifyTestFile(filePath, content) {
    if (isE2E(filePath, content))
        return 'e2e';
    if (isWorker(filePath, content))
        return 'worker';
    if (isIntegration(filePath, content))
        return 'integration';
    return 'unit';
}
//# sourceMappingURL=test-classification.js.map