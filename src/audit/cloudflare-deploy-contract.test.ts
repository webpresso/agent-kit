import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auditCloudflareDeployContract } from "./cloudflare-deploy-contract.js";

const tempDirs: string[] = [];

function makeRepo(
  configBody: string,
  options: {
    writeMetadata?: boolean;
    configFileName?: "webpresso.config.ts" | "agent-kit.config.ts";
    metadata?: {
      releaseKind: "version_pr" | "manual_hotfix";
      durableObjectMigration: "none" | "required";
      rolloutMode: "direct" | "gradual";
      requiredChecks: string[];
    };
  } = {},
) {
  const root = mkdtempSync(path.join(os.tmpdir(), "wp-cloudflare-deploy-contract-"));
  tempDirs.push(root);
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "consumer", type: "module" }),
    "utf8",
  );
  writeFileSync(
    path.join(root, options.configFileName ?? "webpresso.config.ts"),
    configBody,
    "utf8",
  );
  if (options.writeMetadata) {
    mkdirSync(path.join(root, "infra"), { recursive: true });
    writeFileSync(
      path.join(root, "infra/release-metadata.production.json"),
      JSON.stringify(
        options.metadata ?? {
          releaseKind: "version_pr",
          durableObjectMigration: "none",
          rolloutMode: "direct",
          requiredChecks: [],
        },
      ),
      "utf8",
    );
  }
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("auditCloudflareDeployContract", () => {
  it("passes when no webpresso.config.ts is present", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "wp-cloudflare-deploy-contract-empty-"));
    tempDirs.push(root);
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "consumer" }), "utf8");
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  it("fails when the production release metadata file is missing", async () => {
    const root = makeRepo(`
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [],
          },
        },
      }
    `);
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(false);
    expect(result.violations?.[0]?.message).toContain("infra/release-metadata.production.json");
  });

  it("loads the deploy contract from agent-kit.config.ts with agentKitConfig export", async () => {
    const root = makeRepo(
      `
      export const agentKitConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'edge-matte',
                previewTransport: 'workers_dev_env',
                vars: {},
                requiredSecrets: [],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'direct',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true, configFileName: "agent-kit.config.ts" },
    );
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(2);
  });

  it("fails closed when release metadata requests gradual rollout for a Durable Object migration", async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [],
          },
        },
      }
    `,
      {
        writeMetadata: true,
        metadata: {
          releaseKind: "version_pr",
          durableObjectMigration: "required",
          rolloutMode: "gradual",
          requiredChecks: ["production-smoke"],
        },
      },
    );
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(false);
    expect(result.violations?.some((item) => item.message.includes('rolloutMode "direct"'))).toBe(
      true,
    );
  });

  it("rejects manual production deploy workflows and release-preflight gates", async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [],
          },
        },
      }
    `,
      { writeMetadata: true },
    );
    mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
    writeFileSync(
      path.join(root, ".github/workflows/deploy-production.yml"),
      `name: Deploy production
on:
  workflow_dispatch:
`,
      "utf8",
    );
    writeFileSync(
      path.join(root, ".github/workflows/release.yml"),
      `name: Release
on:
  workflow_dispatch:
jobs:
  release-preflight:
`,
      "utf8",
    );

    const result = await auditCloudflareDeployContract(root);

    expect(result.ok).toBe(false);
    expect(result.violations?.some((item) => item.file.endsWith("deploy-production.yml"))).toBe(
      true,
    );
    expect(result.violations?.some((item) => item.message.includes("push to main only"))).toBe(
      true,
    );
    expect(result.violations?.some((item) => item.message.includes("release-preflight"))).toBe(
      true,
    );
  });

  it("fails when a custom-domain target omits routeSpec", async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'edge-matte',
                previewTransport: 'custom_domain_env',
                vars: {},
                requiredSecrets: [],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'direct',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true },
    );
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(false);
    expect(result.violations?.some((item) => item.message.includes("routeSpec"))).toBe(true);
  });

  it("fails when a DO target declares an empty durableObjectBindings array", async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'ingest-lens-api',
                previewTransport: 'workers_dev_env',
                durableObjectBindings: [],
                vars: {},
                requiredSecrets: [],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'gradual',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true },
    );
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations?.some((item) => item.message.includes("no env-specific bindings")),
    ).toBe(true);
  });

  it("fails when a Durable Object target uses workers_dev_env", async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'ingest-lens-api',
                previewTransport: 'workers_dev_env',
                durableObjectBindings: [{ name: 'TOPIC_ROOMS', className: 'TopicRoom' }],
                vars: { ALLOWED_ORIGIN: 'https://preview-main.example.com' },
                requiredSecrets: ['DOPPLER_TOKEN'],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'direct',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true },
    );
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations?.some((item) =>
        item.message.includes('must use previewTransport "custom_domain_env"'),
      ),
    ).toBe(true);
  });

  it("passes with metadata present and a valid custom-domain target", async () => {
    const root = makeRepo(
      `
      export const webpressoConfig = {
        deploy: {
          cloudflare: {
            lanes: {
              dev: { wranglerEnvName: 'dev' },
              preview_main: { wranglerEnvName: 'preview-main' },
              preview_pr: { wranglerEnvNamePattern: 'preview-pr-<n>' },
              prd: { wranglerEnvName: 'production', deployedWorkerNameMode: 'top_level_name' },
            },
            production: { metadataPath: 'infra/release-metadata.production.json' },
            targets: [
              {
                id: 'api',
                type: 'single_worker',
                topLevelWorkerName: 'edge-matte',
                previewTransport: 'custom_domain_env',
                routeSpec: { pattern: 'preview-main.example.com' },
                vars: {},
                requiredSecrets: [],
                storageMode: 'isolated',
                destroyMode: 'wrangler_delete_env',
                productionStrategyDefault: 'direct',
              },
            ],
          },
        },
      }
    `,
      { writeMetadata: true },
    );
    const result = await auditCloudflareDeployContract(root);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
