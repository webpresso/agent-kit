import type { Reporter } from "vitest/reporters";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_REPORT_DIR = resolve(process.cwd(), ".test-reports");

interface FlakinessEntry {
  testId: string;
  name: string;
  fullName: string;
  file: string | undefined;
  retryCount: number;
  repeatCount: number;
  flaky: boolean;
  duration: number | null;
  timestamp: string;
  meta: Record<string, unknown>;
}

interface FlakinessReport {
  version: number;
  generatedAt: string;
  totalTests: number;
  flakyTests: number;
  flakinessRate: number;
  entries: FlakinessEntry[];
}

async function writeReport(path: string, payload: FlakinessReport): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2));
}

export interface FlakinessReporterOptions {
  outputFile?: string;
}

export function createFlakinessReporter(options: FlakinessReporterOptions = {}): Reporter {
  const reportPath =
    options.outputFile ?? resolve(DEFAULT_REPORT_DIR, `flakiness-${process.pid}.json`);
  const entries: FlakinessEntry[] = [];
  let totalTests = 0;

  return {
    onTestCaseResult(testCase) {
      totalTests += 1;
      const diagnostic = testCase.diagnostic();
      if (!diagnostic || !diagnostic.retryCount || diagnostic.retryCount <= 0) return;

      const meta = testCase.meta();
      const moduleFilepath = (testCase.module as unknown as { filepath?: string }).filepath;
      const result = testCase.result() as unknown;
      const duration =
        typeof result === "object" && result !== null && "duration" in result
          ? ((result as { duration?: number }).duration ?? null)
          : null;
      entries.push({
        testId: testCase.id,
        name: testCase.name,
        fullName: testCase.fullName,
        file:
          moduleFilepath ??
          (testCase as unknown as { task?: { file?: { filepath?: string } } }).task?.file?.filepath,
        retryCount: diagnostic.retryCount,
        repeatCount: diagnostic.repeatCount ?? 0,
        flaky: diagnostic.flaky ?? true,
        duration,
        timestamp: new Date().toISOString(),
        meta: meta as Record<string, unknown>,
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
