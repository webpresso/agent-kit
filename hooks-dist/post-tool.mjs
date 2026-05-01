#!/usr/bin/env node
#!/usr/bin/env node

// ../agent-kit/src/hooks/post-tool/lint-after-edit.ts
import { execSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

// ../agent-kit/src/hooks/shared/hook-bootstrap.ts
import { closeSync, openSync } from "node:fs";
function suppressStderr() {
  if (process.platform === "win32") return;
  try {
    closeSync(2);
    openSync("/dev/null", "w");
  } catch {
  }
}
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}
async function runHook(handler, formatter) {
  suppressStderr();
  const raw = await readStdinJson();
  if (!raw.trim()) {
    process.stdout.write("{}");
    process.exit(0);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stdout.write("{}");
    process.exit(0);
  }
  const result = handler(parsed);
  process.stdout.write(result !== null ? formatter(result) : "{}");
  process.exit(0);
}

// ../agent-kit/src/hooks/shared/types.ts
function getFilePath(input) {
  const toolInput = input.tool_input;
  if (!toolInput || typeof toolInput !== "object") return void 0;
  const filePath = toolInput.file_path;
  return typeof filePath === "string" ? filePath : void 0;
}

// ../agent-kit/src/hooks/post-tool/lint-after-edit.ts
var LINTABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".css"];
var SKIP_PATTERNS = [
  /\/node_modules\//,
  /\/dist\//,
  /\/.next\//,
  /\/generated\//,
  /\/worker-configuration\.d\.ts$/
];
function isLintableFile(filePath) {
  return LINTABLE_EXTENSIONS.includes(extname(filePath));
}
function isSkippedPath(filePath) {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}
function shouldLintFile(input) {
  const filePath = getFilePath(input);
  if (!filePath) return false;
  if (!isLintableFile(filePath)) return false;
  if (isSkippedPath(filePath)) return false;
  return true;
}
function lintFile(filePath, projectDir) {
  if (!existsSync(filePath)) return false;
  try {
    execSync(`just lint --file "${filePath}"`, { cwd: projectDir, stdio: "ignore" });
  } catch {
  }
  return true;
}
function processPostToolUse(input, projectDir) {
  if (!shouldLintFile(input)) return false;
  const filePath = input.tool_input.file_path;
  return lintFile(filePath, projectDir);
}
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  runHook(
    (input) => {
      const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      processPostToolUse(input, projectDir);
      return null;
    },
    () => "{}"
  );
}
export {
  LINTABLE_EXTENSIONS,
  SKIP_PATTERNS,
  isLintableFile,
  isSkippedPath,
  lintFile,
  processPostToolUse,
  shouldLintFile
};
