import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { detectEvidenceGap } from './evidence-gap.js';
import { readPretoolEvidence, } from './read-pretool-log.js';
export async function auditWeaknessMining(rootDirectory = process.cwd(), options = {}) {
    const report = mineWeaknesses(rootDirectory, options);
    const violations = report.findings.map((finding) => ({
        file: finding.files[0],
        message: `${finding.id}: ${finding.message}`,
    }));
    if (options.draftTechDebt && report.findings.length > 0) {
        const draftPath = await writeWeaknessMiningTechDebtDraft(rootDirectory, report.findings);
        violations.push({
            file: draftPath,
            message: `Drafted tech-debt item for weakness-mining findings: ${draftPath}`,
        });
    }
    return {
        ok: violations.length === 0,
        title: 'Weakness mining audit',
        checked: report.checked,
        violations,
    };
}
export function mineWeaknesses(rootDirectory = process.cwd(), options = {}) {
    const readResult = readPretoolEvidence(rootDirectory, options);
    const evidenceGap = detectEvidenceGap(readResult);
    const findings = evidenceGap ? [] : buildFindings(readResult.records);
    return {
        ok: findings.length === 0,
        checked: readResult.records.length,
        findings,
        evidenceGap,
        warnings: readResult.warnings,
    };
}
function buildFindings(records) {
    const groups = new Map();
    for (const record of records) {
        if (record.status !== 'BLOCK' && record.status !== 'ERROR')
            continue;
        const normalizedTarget = normalizeTarget(record.target);
        const failureKey = record.failures?.join(',') ?? record.error ?? record.status;
        const key = [record.status, record.tool, normalizedTarget, failureKey].join('\0');
        const group = groups.get(key) ?? [];
        group.push(record);
        groups.set(key, group);
    }
    const findings = [];
    for (const group of groups.values()) {
        if (group.length < 2)
            continue;
        const first = group[0];
        if (!first)
            continue;
        const kind = first.status === 'ERROR' ? 'repeated-error' : 'repeated-block';
        const failures = first.failures?.length ? ` (${first.failures.join(', ')})` : '';
        const target = normalizeTarget(first.target);
        const id = `WM-${createHash('sha1').update(`${kind}:${first.tool}:${target}:${failures}`).digest('hex').slice(0, 8)}`;
        findings.push({
            id,
            kind,
            severity: kind === 'repeated-error' ? 'high' : 'medium',
            surfaceId: 'codex-hooks',
            tool: first.tool,
            target,
            occurrences: group.length,
            files: [...new Set(group.map((record) => `${record.sourceFile}:${record.lineNumber}`))],
            message: `${group.length} repeated ${first.status} ${first.tool} pretool records for ${target}${failures}`,
        });
    }
    return findings.sort((left, right) => left.id.localeCompare(right.id));
}
function normalizeTarget(target) {
    return target.replace(/\s+/gu, ' ').trim().slice(0, 160);
}
async function writeWeaknessMiningTechDebtDraft(rootDirectory, findings) {
    const root = resolve(rootDirectory);
    const statusDir = join(root, 'tech-debt', 'needs-remediation');
    await mkdir(statusDir, { recursive: true });
    const hash = createHash('sha256').update(JSON.stringify(findings)).digest('hex').slice(0, 16);
    const filePath = join(statusDir, `h-weakness-mining-${hash}.md`);
    if (existsSync(filePath))
        return filePath;
    const today = new Date().toISOString().slice(0, 10);
    const body = [
        '---',
        'type: tech-debt',
        'status: needs-remediation',
        'severity: medium',
        'category: testing',
        'review_cadence: biweekly',
        `last_reviewed: '${today}'`,
        `created: '${today}'`,
        `auto_filed_hash: weakness-mining-${hash}`,
        'linked_blueprints: []',
        'affected_modules:',
        '  - src/hooks',
        '---',
        '',
        '# Weakness-mining hook evidence findings',
        '',
        ...findings.map((finding) => `- ${finding.id}: ${finding.message} [${finding.surfaceId}]`),
        '',
    ].join('\n');
    await writeFile(filePath, body, { flag: 'wx' });
    return filePath;
}
//# sourceMappingURL=index.js.map