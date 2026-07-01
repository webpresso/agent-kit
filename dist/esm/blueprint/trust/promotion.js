import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateBlueprintTrust } from "./validator.js";
import { parseTrustDossier } from "./dossier.js";
import { parseAllowedWpCommand } from "./gates.js";
import { resolvePackageAssetPreferred } from "#utils/package-assets.js";
export { parseAllowedWpCommand };
const PROMOTION_GATE_TIMEOUT_MS = 30_000;
const PROMOTION_GATE_STDIO_TAIL_LIMIT = 500;
export function applyPromotionTrustGate(input) {
    const now = (input.now ?? new Date()).toISOString();
    const syntacticMarkdown = upsertReadinessValue(upsertReadinessValue(input.markdown, "verified-at", now), "verified-head", "0123456789abcdef0123456789abcdef01234567");
    const parsedBeforeHead = parseTrustDossier(syntacticMarkdown);
    if (parsedBeforeHead.violations.length > 0)
        throw new Error(`Blueprint trust gate failed: ${parsedBeforeHead.violations.map((v) => `${v.section}: ${v.message}`).join("; ")}`);
    const head = readHead(input.repoRoot);
    let markdown = upsertReadinessValue(input.markdown, "verified-at", now);
    markdown = upsertReadinessValue(markdown, "verified-head", head);
    const preflight = validateBlueprintTrust({
        repoRoot: input.repoRoot,
        file: input.file,
        status: "draft",
        markdown,
        promotionCandidate: true,
        requirePassingGates: false,
        scanTaskAmbiguity: true,
    });
    if (!preflight.ok)
        throw new Error(`Blueprint trust gate failed: ${preflight.violations.map((v) => `${v.section}: ${v.message}`).join("; ")}`);
    const parsed = parseTrustDossier(markdown);
    for (const gate of parsed.dossier?.gates ?? []) {
        runPromotionCommand(input.repoRoot, gate.command);
        markdown = updateGateLastResult(markdown, gate.gate, `pass at ${now}`);
    }
    const validated = validateBlueprintTrust({
        repoRoot: input.repoRoot,
        file: input.file,
        status: "draft",
        markdown,
        promotionCandidate: true,
        scanTaskAmbiguity: true,
    });
    if (!validated.ok)
        throw new Error(`Blueprint trust gate failed: ${validated.violations.map((v) => `${v.section}: ${v.message}`).join("; ")}`);
    return markdown;
}
function readHead(repoRoot) {
    const testHead = process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"];
    if (process.env["VITEST"] === "true" && testHead && /^[a-f0-9]{40}$/iu.test(testHead)) {
        return testHead;
    }
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    }
    catch {
        throw new Error("Blueprint trust gate failed: git HEAD is unavailable");
    }
}
export function runPromotionCommand(repoRoot, command, deps = {}) {
    const argv = parseAllowedWpCommand(command);
    const [binary, ...args] = argv;
    if (binary === undefined)
        throw new Error(`Promotion gate command is empty: ${command}`);
    const invocation = resolvePromotionGateInvocation(repoRoot, binary, args);
    const spawn = deps.spawn ?? spawnSync;
    const result = spawn(invocation.command, invocation.args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: PROMOTION_GATE_TIMEOUT_MS,
        env: invocation.env,
    });
    if (result.status === 0 && !result.error && result.signal === null)
        return;
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    const logPath = writePromotionGateLog(repoRoot, command, invocation, stdout, stderr, result);
    throw new Error(formatPromotionGateFailure(command, stdout, stderr, result, logPath));
}
function resolvePromotionGateInvocation(repoRoot, binary, args) {
    if (binary === "./bin/wp") {
        return {
            command: join(repoRoot, "bin", process.platform === "win32" ? "wp.cmd" : "wp"),
            args: [...args],
            env: { ...process.env, PATH: `${repoRoot}/bin:${process.env["PATH"] ?? ""}` },
        };
    }
    if (binary === "wp") {
        const packagedLauncher = resolvePackagedWpLauncher();
        return {
            command: process.execPath,
            args: [packagedLauncher, ...args],
            env: { ...process.env },
        };
    }
    return {
        command: binary,
        args: [...args],
        env: { ...process.env, PATH: `${repoRoot}/bin:${process.env["PATH"] ?? ""}` },
    };
}
function resolvePackagedWpLauncher() {
    const launcher = resolvePackageAssetPreferred([
        process.platform === "win32" ? "bin/wp.cmd" : "bin/wp",
        "bin/wp",
    ]);
    if (!existsSync(launcher)) {
        throw new Error(`Promotion gate failed: packaged wp launcher is unavailable at ${launcher}`);
    }
    return launcher;
}
function formatPromotionGateFailure(command, stdout, stderr, result, logPath) {
    const details = [];
    if (typeof result.status === "number")
        details.push(`exit=${result.status}`);
    if (result.signal)
        details.push(`signal=${result.signal}`);
    if (result.error) {
        const code = typeof result.error === "object" &&
            result.error !== null &&
            "code" in result.error &&
            typeof result.error.code === "string"
            ? result.error.code
            : null;
        details.push(code ? `spawn_error=${code}` : `spawn_error=${result.error.message}`);
        if (code === "ETIMEDOUT")
            details.push(`timeout=${PROMOTION_GATE_TIMEOUT_MS}ms`);
    }
    const stderrTail = tailBounded(stderr);
    const stdoutTail = tailBounded(stdout);
    if (stderrTail.length > 0)
        details.push(`stderr_tail=${JSON.stringify(stderrTail)}`);
    if (stdoutTail.length > 0)
        details.push(`stdout_tail=${JSON.stringify(stdoutTail)}`);
    details.push(`log=${logPath}`);
    return `Promotion gate failed (${command}): ${details.join("; ")}`;
}
function tailBounded(text) {
    if (text.length <= PROMOTION_GATE_STDIO_TAIL_LIMIT)
        return text.trim();
    return text.slice(-PROMOTION_GATE_STDIO_TAIL_LIMIT).trim();
}
function writePromotionGateLog(repoRoot, command, invocation, stdout, stderr, result) {
    const logsDir = join(repoRoot, ".webpresso", "logs", "promotion-gates");
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, `${Date.now()}-promotion-gate.log`);
    const errorBlock = result.error
        ? `error: ${result.error.name}: ${result.error.message}\n`
        : "error: none\n";
    writeFileSync(logPath, [
        `command: ${command}`,
        `invocation: ${invocation.command} ${invocation.args.join(" ")}`,
        `exit: ${result.status ?? "null"}`,
        `signal: ${result.signal ?? "null"}`,
        `timeout_ms: ${PROMOTION_GATE_TIMEOUT_MS}`,
        errorBlock.trimEnd(),
        "--- stderr ---",
        stderr,
        "--- stdout ---",
        stdout,
        "",
    ].join("\n"), "utf8");
    return logPath;
}
function upsertReadinessValue(markdown, key, value) {
    const re = new RegExp(`^- ${key}: .*$`, "mu");
    if (re.test(markdown))
        return markdown.replace(re, `- ${key}: ${value}`);
    const lines = markdown.split("\n");
    const headingIndex = lines.findIndex((line) => /^###\s+Readiness Verdict\s*$/iu.test(line));
    if (headingIndex === -1)
        return markdown;
    let insertIndex = headingIndex + 1;
    while (insertIndex < lines.length && lines[insertIndex]?.trim() === "")
        insertIndex += 1;
    lines.splice(insertIndex, 0, `- ${key}: ${value}`);
    return lines.join("\n");
}
function updateGateLastResult(markdown, gate, result) {
    const lines = markdown.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const cells = line.trim().startsWith("|")
            ? line
                .slice(1, -1)
                .split("|")
                .map((c) => c.trim())
            : [];
        if (cells[0] === gate && cells.length === 4) {
            lines[i] = `| ${cells[0]} | ${cells[1]} | ${cells[2]} | ${result} |`;
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=promotion.js.map