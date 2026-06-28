import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadWebpressoConfigSafe } from "#e2e/load-host-adapter";
function violation(file, message) {
    return { file, message };
}
const ProductionReleaseMetadataSchema = z.looseObject({
    releaseKind: z.unknown().optional(),
    durableObjectMigration: z.unknown().optional(),
    rolloutMode: z.unknown().optional(),
    requiredChecks: z.unknown().optional(),
});
function readProductionMetadata(metadataPath) {
    return ProductionReleaseMetadataSchema.parse(JSON.parse(readFileSync(metadataPath, "utf8")));
}
export async function auditCloudflareDeployContract(root) {
    let loaded;
    try {
        loaded = await loadWebpressoConfigSafe({ cwd: root });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            ok: false,
            title: "Cloudflare deploy contract",
            checked: 1,
            violations: [violation(path.join(root, "webpresso.config.ts"), message)],
        };
    }
    const configPath = loaded?.configPath ?? path.join(root, "webpresso.config.ts");
    const cloudflare = loaded?.config.deploy?.cloudflare;
    if (!cloudflare) {
        return {
            ok: true,
            title: "Cloudflare deploy contract",
            checked: 0,
            violations: [],
        };
    }
    const violations = [];
    const manualProductionWorkflowPath = path.join(root, ".github", "workflows", "deploy-production.yml");
    if (existsSync(manualProductionWorkflowPath)) {
        violations.push(violation(".github/workflows/deploy-production.yml", "production deploys must be gated by the Changesets release workflow; remove the manual deploy-production workflow"));
    }
    const releaseWorkflowPath = path.join(root, ".github", "workflows", "release.yml");
    if (existsSync(releaseWorkflowPath)) {
        const releaseWorkflow = readFileSync(releaseWorkflowPath, "utf8");
        if (/workflow_dispatch:/u.test(releaseWorkflow)) {
            violations.push(violation(".github/workflows/release.yml", "production release workflow must run from push to main only, not workflow_dispatch"));
        }
        if (/release-preflight:/u.test(releaseWorkflow)) {
            violations.push(violation(".github/workflows/release.yml", "release workflow must let changesets/action decide whether to open a Version Packages PR or publish; remove release-preflight"));
        }
    }
    const metadataPath = path.join(root, cloudflare.production.metadataPath);
    if (!existsSync(metadataPath)) {
        violations.push(violation(configPath, `shared deploy contract requires ${cloudflare.production.metadataPath} to exist`));
    }
    else {
        try {
            const metadata = readProductionMetadata(metadataPath);
            if (metadata.durableObjectMigration === "required" && metadata.rolloutMode !== "direct") {
                violations.push(violation(cloudflare.production.metadataPath, 'Durable Object migration releases must use rolloutMode "direct"'));
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            violations.push(violation(cloudflare.production.metadataPath, `production release metadata must be valid JSON: ${message}`));
        }
    }
    for (const target of cloudflare.targets) {
        const isDurableObjectTarget = (target.durableObjectBindings?.length ?? 0) > 0;
        if (target.previewTransport === "custom_domain_env" && !target.routeSpec) {
            violations.push(violation(configPath, `target ${target.id} uses custom_domain_env but does not declare routeSpec`));
        }
        if (target.durableObjectBindings && target.durableObjectBindings.length === 0) {
            violations.push(violation(configPath, `target ${target.id} declares durableObjectBindings but provides no env-specific bindings`));
        }
        if (isDurableObjectTarget && target.previewTransport !== "custom_domain_env") {
            violations.push(violation(configPath, `target ${target.id} is a Durable Object consumer and must use previewTransport "custom_domain_env"`));
        }
        if (isDurableObjectTarget && Object.keys(target.vars).length === 0) {
            violations.push(violation(configPath, `target ${target.id} is a Durable Object consumer and must declare at least one env-specific var`));
        }
        if (isDurableObjectTarget && target.requiredSecrets.length === 0) {
            violations.push(violation(configPath, `target ${target.id} is a Durable Object consumer and must declare at least one required secret name`));
        }
        if (target.storageMode === "shared_via_script_name" && !target.blastRadiusDoc) {
            violations.push(violation(configPath, `target ${target.id} uses shared_via_script_name without blastRadiusDoc`));
        }
    }
    return {
        ok: violations.length === 0,
        title: "Cloudflare deploy contract",
        checked: 1 + cloudflare.targets.length,
        violations,
    };
}
//# sourceMappingURL=cloudflare-deploy-contract.js.map