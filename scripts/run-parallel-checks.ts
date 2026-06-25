import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type Check = {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
};

type CheckResult = {
  readonly check: Check;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
};

const QA_CHECKS: readonly Check[] = [
  { name: "typecheck", command: "vp", args: ["run", "typecheck"] },
  { name: "lint", command: "vp", args: ["run", "lint"] },
  { name: "format", command: "./bin/wp", args: ["format", "--check"] },
  { name: "test", command: "vp", args: ["run", "test"] },
  { name: "lint:pkg", command: "vp", args: ["run", "lint:pkg"] },
  { name: "audits:check", command: "vp", args: ["run", "audits:check"] },
];

function prefixLines(name: string, chunk: Buffer, write: (text: string) => void): void {
  const text = chunk.toString("utf8");
  for (const line of text.split(/(?<=\n)/u)) {
    if (line.length > 0) write(`[${name}] ${line}`);
  }
}

function runCheck(
  check: Check,
  children: Set<ChildProcessWithoutNullStreams>,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const child = spawn(check.command, check.args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);

    process.stdout.write(`[${check.name}] $ ${[check.command, ...check.args].join(" ")}\n`);
    child.stdout.on("data", (chunk: Buffer) =>
      prefixLines(check.name, chunk, (text) => process.stdout.write(text)),
    );
    child.stderr.on("data", (chunk: Buffer) =>
      prefixLines(check.name, chunk, (text) => process.stderr.write(text)),
    );
    child.on("error", (error) => {
      process.stderr.write(`[${check.name}] failed to start: ${error.message}\n`);
      children.delete(child);
      resolve({ check, code: 1, signal: null });
    });
    child.on("close", (code, signal) => {
      children.delete(child);
      const suffix = signal === null ? `exit ${code}` : `signal ${signal}`;
      process.stdout.write(`[${check.name}] completed with ${suffix}\n`);
      resolve({ check, code, signal });
    });
  });
}

function stopChildren(children: Set<ChildProcessWithoutNullStreams>): void {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

async function main(): Promise<void> {
  const children = new Set<ChildProcessWithoutNullStreams>();
  process.once("SIGINT", () => {
    stopChildren(children);
    process.exitCode = 130;
  });
  process.once("SIGTERM", () => {
    stopChildren(children);
    process.exitCode = 143;
  });

  const startedAt = Date.now();
  const results = await Promise.all(QA_CHECKS.map((check) => runCheck(check, children)));
  const failed = results.filter((result) => result.code !== 0 || result.signal !== null);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  process.stdout.write(`\nParallel checks completed in ${elapsedSeconds}s\n`);
  for (const result of results) {
    const status = result.code === 0 && result.signal === null ? "PASS" : "FAIL";
    const detail = result.signal === null ? `exit ${result.code}` : `signal ${result.signal}`;
    process.stdout.write(`- ${status} ${result.check.name} (${detail})\n`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
