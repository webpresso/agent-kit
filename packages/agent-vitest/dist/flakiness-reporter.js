import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const DEFAULT_REPORT_DIR = resolve(process.cwd(), '.test-reports');
async function writeReport(path, payload) {
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, JSON.stringify(payload, null, 2));
}
export function createFlakinessReporter(options = {}) {
    const reportPath = options.outputFile ?? resolve(DEFAULT_REPORT_DIR, `flakiness-${process.pid}.json`);
    const entries = [];
    let totalTests = 0;
    return {
        onTestCaseResult(testCase) {
            totalTests += 1;
            const diagnostic = testCase.diagnostic();
            if (!diagnostic || !diagnostic.retryCount || diagnostic.retryCount <= 0)
                return;
            const meta = testCase.meta();
            const moduleFilepath = testCase.module.filepath;
            const result = testCase.result();
            const duration = typeof result === 'object' && result !== null && 'duration' in result
                ? (result.duration ?? null)
                : null;
            entries.push({
                testId: testCase.id,
                name: testCase.name,
                fullName: testCase.fullName,
                file: moduleFilepath ??
                    testCase.task?.file?.filepath,
                retryCount: diagnostic.retryCount,
                repeatCount: diagnostic.repeatCount ?? 0,
                flaky: diagnostic.flaky ?? true,
                duration,
                timestamp: new Date().toISOString(),
                meta: meta,
            });
        },
        async onTestRunEnd() {
            const flakyTests = entries.length;
            const flakinessRate = totalTests ? flakyTests / totalTests : 0;
            await writeReport(reportPath, {
                version: 1,
                generatedAt: new Date().toISOString(),
                totalTests,
                flakyTests,
                flakinessRate,
                entries,
            });
        },
    };
}
export default createFlakinessReporter;
