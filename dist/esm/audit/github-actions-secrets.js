import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SECRETS_CONFIG_PATH } from "./lib/secrets-policy.js";
const WORKFLOW_FILE_PATTERN = /\.(ya?ml)$/iu;
const SECRET_BEARING_ACTION_PREFIXES = [
    "dopplerhq/secrets-fetch-action@",
    "dopplerhq/cli-action@",
];
const FULL_SHA_PATTERN = /@[0-9a-f]{40}(?:\s|$)/iu;
const INFISICAL_INDICATORS = [/INFISICAL_TOKEN/u, /\binfisical export\b/u];
function walkWorkflowFiles(dir) {
    if (!existsSync(dir))
        return [];
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkWorkflowFiles(fullPath));
            continue;
        }
        if (entry.isFile() && WORKFLOW_FILE_PATTERN.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}
function isSecretBearing(content) {
    return (SECRET_BEARING_ACTION_PREFIXES.some((prefix) => content.includes(prefix)) ||
        INFISICAL_INDICATORS.some((pattern) => pattern.test(content)));
}
function declaresCiSecretProviderToken(content) {
    const lines = content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index]?.trim().startsWith("ci_secret_provider_token:"))
            continue;
        const secretIndent = (lines[index]?.match(/^\s*/u)?.[0].length ?? 0) + 1;
        for (let childIndex = index + 1; childIndex < lines.length; childIndex += 1) {
            const line = lines[childIndex] ?? "";
            if (line.trim().length === 0)
                continue;
            const indent = line.match(/^\s*/u)?.[0].length ?? 0;
            if (indent < secretIndent)
                break;
            if (/^\s+required:\s*(?:true|false)\s*$/iu.test(line))
                return true;
        }
    }
    return false;
}
function findViolations(root, file) {
    const relPath = relative(root, file).replace(/\\/gu, "/");
    const content = readFileSync(file, "utf8");
    const violations = [];
    const isReusableWorkflow = /(^|\n)\s*workflow_call:\s*$/mu.test(content);
    const hasSecretBearingAccess = isSecretBearing(content);
    if (/\bsecrets:\s*inherit\b/u.test(content)) {
        violations.push({
            file: relPath,
            message: `${relPath}: reusable secret workflows must declare explicit named secrets instead of \`secrets: inherit\``,
        });
    }
    if (isReusableWorkflow && /^\s*environment:\s+/mu.test(content)) {
        violations.push({
            file: relPath,
            message: `${relPath}: workflow_call secret workflows must not depend on GitHub Environment secrets; pass explicit workflow_call secrets instead`,
        });
    }
    if (isReusableWorkflow && hasSecretBearingAccess && !declaresCiSecretProviderToken(content)) {
        violations.push({
            file: relPath,
            message: `${relPath}: reusable secret-bearing workflows must declare ci_secret_provider_token explicitly`,
        });
    }
    if (hasSecretBearingAccess && !/\bid-token:\s*write\b/u.test(content)) {
        violations.push({
            file: relPath,
            message: `${relPath}: secret-bearing workflows must request id-token: write`,
        });
    }
    for (const line of content.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!/^(?:-\s*)?uses:\s+/u.test(trimmed))
            continue;
        for (const prefix of SECRET_BEARING_ACTION_PREFIXES) {
            if (!trimmed.includes(prefix))
                continue;
            if (FULL_SHA_PATTERN.test(trimmed))
                continue;
            violations.push({
                file: relPath,
                message: `${relPath}: secret-bearing action must be pinned to a full SHA instead of ${trimmed.replace(/^-\s+uses:\s*/u, "").replace(/^uses:\s*/u, "")}`,
            });
        }
    }
    return violations;
}
export function auditGithubActionsSecrets(rootDirectory = process.cwd()) {
    if (!existsSync(join(rootDirectory, SECRETS_CONFIG_PATH))) {
        return { ok: true, title: "github-actions-secrets", checked: 0, violations: [] };
    }
    const workflowRoot = join(rootDirectory, ".github", "workflows");
    const workflowFiles = walkWorkflowFiles(workflowRoot);
    const violations = workflowFiles.flatMap((file) => findViolations(rootDirectory, file));
    return {
        ok: violations.length === 0,
        title: "github-actions-secrets",
        checked: workflowFiles.length,
        violations,
    };
}
export const auditGitHubActionsSecrets = auditGithubActionsSecrets;
//# sourceMappingURL=github-actions-secrets.js.map