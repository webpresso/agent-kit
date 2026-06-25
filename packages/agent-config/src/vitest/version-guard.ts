import { readConsumerPackageJson, requireFromConsumer } from "./consumer-package.js";

const getVitestVersion = (): string => {
  try {
    return (requireFromConsumer("vitest/package.json") as { version: string }).version;
  } catch (error) {
    const wrapped = new Error(
      `[vitest] Unable to resolve local vitest version. ` +
        `Install vitest in the package and use the correct catalog. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
};

const getVitestMajor = (): number => {
  const version = getVitestVersion();
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  return Number.isNaN(major) ? 0 : major;
};

const hasWorkersPool = (): boolean => {
  const pkg = readConsumerPackageJson<{
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  }>();

  return (
    !!pkg &&
    ("@cloudflare/vitest-pool-workers" in (pkg.devDependencies ?? {}) ||
      "@cloudflare/vitest-pool-workers" in (pkg.dependencies ?? {}))
  );
};

const getPackageName = (): string => {
  return readConsumerPackageJson<{ name?: string }>()?.name ?? "this package";
};

export const assertVitest4 = ({ caller }: { caller?: string } = {}): void => {
  const major = getVitestMajor();
  if (major >= 4) {
    return;
  }

  const packageName = getPackageName();
  const catalogHint = hasWorkersPool() ? "catalog:workers" : "catalog:";

  throw new Error(
    `[vitest] ${caller ?? "Vitest config"} requires vitest 4.x. ` +
      `${packageName} appears to be using vitest ${getVitestVersion()}. ` +
      `Use the Vitest 4.1 line from ${catalogHint}.`,
  );
};

export const assertNonWorkersVitest4 = ({ caller }: { caller?: string } = {}): void => {
  assertVitest4({ caller: caller ?? "Non-workers config" });
};
