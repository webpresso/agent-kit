#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export type WorkflowSkillsStagingPolicy = {
  schemaVersion: number;
  sizeBudgetBytes: number;
  sourceRoot: string;
  notice: string;
  provenance: string;
  skills: Array<{ name: string; source: string; target: string }>;
  deniedPathPatterns: string[];
  deniedContentPatterns: string[];
};

export type StageWorkflowSkillsResult = {
  staged: string[];
  totalBytes: number;
};

export function readWorkflowSkillsStagingPolicy(repoRoot: string): WorkflowSkillsStagingPolicy {
  const policyPath = path.join(repoRoot, "packages/workflow-skills/staging/allowlist.json");
  return JSON.parse(readFileSync(policyPath, "utf8")) as WorkflowSkillsStagingPolicy;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function walkFiles(root: string): string[] {
  const results: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue;
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) visit(fullPath);
      else if (stat.isFile()) results.push(fullPath);
    }
  };
  visit(root);
  return results.sort();
}

export function validateWorkflowSkillsStagingPolicy(
  repoRoot: string,
  policy = readWorkflowSkillsStagingPolicy(repoRoot),
): void {
  const sourceRoot = path.join(repoRoot, policy.sourceRoot);
  const noticePath = path.join(sourceRoot, policy.notice);
  const provenancePath = path.join(sourceRoot, policy.provenance);
  if (!existsSync(noticePath)) throw new Error(`missing workflow skills NOTICE: ${policy.notice}`);
  if (!existsSync(provenancePath))
    throw new Error(`missing workflow skills provenance: ${policy.provenance}`);

  const allowlisted = new Set(
    policy.skills.map((skill) => normalizePath(path.join(policy.sourceRoot, skill.source))),
  );
  let totalBytes = 0;

  for (const filePath of walkFiles(sourceRoot)) {
    const rel = normalizePath(path.relative(repoRoot, filePath));
    const relFromSource = normalizePath(path.relative(sourceRoot, filePath));
    for (const denied of policy.deniedPathPatterns) {
      if (rel.includes(denied) || relFromSource.includes(denied)) {
        throw new Error(`denied workflow skills path matched ${denied}: ${rel}`);
      }
    }

    totalBytes += statSync(filePath).size;

    const isAllowlistedSkill = allowlisted.has(rel);
    if (isAllowlistedSkill) {
      const content = readFileSync(filePath, "utf8");
      for (const denied of policy.deniedContentPatterns) {
        if (content.toLowerCase().includes(denied.toLowerCase())) {
          throw new Error(`denied workflow skills content matched ${denied}: ${rel}`);
        }
      }
    }
  }

  if (totalBytes > policy.sizeBudgetBytes) {
    throw new Error(
      `workflow skills source payload ${totalBytes} exceeds budget ${policy.sizeBudgetBytes}`,
    );
  }
}

export function stageWorkflowSkills(repoRoot = process.cwd()): StageWorkflowSkillsResult {
  const policy = readWorkflowSkillsStagingPolicy(repoRoot);
  validateWorkflowSkillsStagingPolicy(repoRoot, policy);
  const staged: string[] = [];
  let totalBytes = 0;

  for (const skill of policy.skills) {
    const source = path.join(repoRoot, policy.sourceRoot, skill.source);
    const target = path.join(repoRoot, skill.target);
    if (!existsSync(source)) throw new Error(`missing allowlisted workflow skill: ${skill.source}`);
    const content = readFileSync(source, "utf8");
    totalBytes += Buffer.byteLength(content);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
    staged.push(normalizePath(path.relative(repoRoot, target)));
  }

  return { staged: staged.sort(), totalBytes };
}

if (import.meta.main) {
  const result = stageWorkflowSkills(process.cwd());
  console.log(
    `stage-workflow-skills: staged ${result.staged.length} skills (${result.totalBytes} bytes)`,
  );
}
