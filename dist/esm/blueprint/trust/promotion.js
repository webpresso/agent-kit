import { execFileSync, spawnSync } from "node:child_process";
import { validateBlueprintTrust } from "./validator.js";
import { parseTrustDossier } from "./dossier.js";
import { parseAllowedWpCommand } from "./gates.js";
export { parseAllowedWpCommand };
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
export function runPromotionCommand(repoRoot, command) {
    const argv = parseAllowedWpCommand(command);
    const [binary, ...args] = argv;
    if (binary === undefined)
        throw new Error(`Promotion gate command is empty: ${command}`);
    const result = spawnSync(binary, args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        env: { ...process.env, PATH: `${repoRoot}/bin:${process.env["PATH"] ?? ""}` },
    });
    if (result.status !== 0)
        throw new Error(`Promotion gate failed (${command}): ${(result.stderr || result.stdout || "").slice(0, 500)}`);
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