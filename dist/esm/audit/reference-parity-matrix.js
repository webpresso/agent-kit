import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateReplacementParityCapabilityCrosswalk } from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js';
export const REFERENCE_PARITY_MATRIX_PATH = 'docs/bench/reference-parity-matrix.md';
export const REQUIRED_REFERENCE_PARITY_CAPABILITIES = [
    'lifecycle capture',
    'resume injection',
    'tool discovery',
    'indexed search',
    'routing injection',
    'pretool session redirect',
    'posttool broad capture',
    'registry/routing consistency',
    'repair path evidence',
    'host setup smoke',
    'benchmark thresholds',
    'release claim gating',
];
export const REFERENCE_PARITY_COLUMNS = [
    'capability',
    'host scope',
    'support level',
    'proof artifact',
    'required for release',
    'status',
];
const SUPPORT_LEVELS = new Set(['full', 'degraded', 'unsupported']);
const STATUSES = new Set(['passed', 'open', 'blocked']);
const FULL_PASSED_PROOF_MARKERS = {
    'lifecycle capture': ['SessionMemorySessionStore', 'captureEvent', 'restore'],
    'resume injection': ['SessionStart', 'WP_ROUTING_BLOCK', 'additionalContext'],
    'tool discovery': ['tools/list', 'wp_session_execute', 'wp_session_search'],
    'indexed search': ['SessionMemoryStore', 'searchUnified', 'restore context'],
    'routing injection': ['<wp_session_context>', 'wp_session_batch_execute', 'wp_session_execute_file'],
    'pretool session redirect': ['routeToolInputToSessionMemory', 'wp_session_batch_execute', 'routeCommand'],
    'posttool broad capture': ['PostToolUse', 'capturePostToolUse', 'byte-caps'],
    'registry/routing consistency': ['COMPILED_TOOL_REGISTRY', 'wp_session_batch_execute', 'wp_session_doctor'],
    'repair path evidence': ['runHooksDoctor', 'wp-pretool-guard', 'restore'],
    'host setup smoke': ['referenceParityHostSmokeFixtures', 'collectContinuityLifecycleProofs', 'degraded'],
    'benchmark thresholds': ['buildSessionMemoryThresholdReport', 'search_quality_recall_at_5', 'dry-run'],
    'release claim gating': ['reference-parity-matrix', 'reference-parity', 'release'],
};
export function auditReferenceParityMatrix(rootDirectory = process.cwd(), relativePath = REFERENCE_PARITY_MATRIX_PATH, options = {}) {
    const violations = [];
    const root = resolve(rootDirectory);
    const filePath = resolve(root, relativePath);
    if (!existsSync(filePath)) {
        violations.push({
            file: relativePath,
            message: 'Missing reference parity matrix.',
        });
        return {
            ok: false,
            title: 'Reference parity matrix audit',
            checked: 1,
            violations,
            rows: [],
            releaseClaimGateReady: false,
        };
    }
    const content = readFileSync(filePath, 'utf8');
    const rawRows = parseMarkdownTable(content);
    const rows = rawRows.flatMap((row, index) => parseRow(row, index + 1, relativePath, violations));
    validateRequiredRows(rows, relativePath, violations);
    validateProofArtifacts(rows, root, relativePath, violations);
    validateReleaseCriticalRows(rows, relativePath, violations);
    validateFullPassedProofStrength(rows, root, relativePath, violations);
    validateHostCapabilityCrosswalk(rows, relativePath, violations);
    const releaseClaimGateReady = violations.length === 0 &&
        REQUIRED_REFERENCE_PARITY_CAPABILITIES.every((capability) => rows.some((row) => row.capability === capability &&
            row.requiredForRelease &&
            row.supportLevel === 'full' &&
            row.status === 'passed'));
    if (options.requireReleaseReady && violations.length === 0 && !releaseClaimGateReady) {
        violations.push({
            file: relativePath,
            message: 'Reference parity release gate is not ready: release-required rows must be full and passed before public replacement-parity claims.',
        });
    }
    return {
        ok: violations.length === 0,
        title: 'Reference parity matrix audit',
        checked: Math.max(1, rows.length),
        violations,
        rows,
        releaseClaimGateReady,
    };
}
function parseMarkdownTable(content) {
    const lines = content
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('|') && line.endsWith('|'));
    for (let index = 0; index < lines.length - 1; index += 1) {
        const headerCells = splitTableRow(lines[index] ?? '').map(normalizeHeader);
        if (!hasRequiredColumns(headerCells))
            continue;
        const rows = [];
        for (const line of lines.slice(index + 2)) {
            const cells = splitTableRow(line);
            if (cells.length !== headerCells.length)
                continue;
            const row = Object.fromEntries(headerCells.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
            if (hasRequiredColumns(Object.keys(row)))
                rows.push(row);
        }
        return rows;
    }
    return [];
}
function splitTableRow(line) {
    return line
        .replace(/^\|/u, '')
        .replace(/\|$/u, '')
        .split('|')
        .map((cell) => cell.trim());
}
function normalizeHeader(header) {
    return header.toLowerCase().replace(/\s+/gu, ' ');
}
function hasRequiredColumns(columns) {
    return REFERENCE_PARITY_COLUMNS.every((column) => columns.includes(column));
}
function parseRow(row, rowNumber, file, violations) {
    const supportLevel = row['support level'].toLowerCase();
    const status = row.status.toLowerCase();
    const requiredForRelease = parseRequiredForRelease(row['required for release']);
    if (!SUPPORT_LEVELS.has(supportLevel)) {
        violations.push({
            file,
            message: `Row ${rowNumber} has unsupported replacement parity support level: ${row['support level']}.`,
        });
        return [];
    }
    if (!STATUSES.has(status)) {
        violations.push({
            file,
            message: `Row ${rowNumber} has unsupported replacement parity status: ${row.status}.`,
        });
        return [];
    }
    if (requiredForRelease === undefined) {
        violations.push({
            file,
            message: `Row ${rowNumber} must use yes/no for required for release.`,
        });
        return [];
    }
    return [
        {
            capability: row.capability.toLowerCase(),
            hostScope: row['host scope'],
            supportLevel: supportLevel,
            proofArtifact: row['proof artifact'],
            requiredForRelease,
            status: status,
        },
    ];
}
function parseRequiredForRelease(value) {
    const normalized = value.toLowerCase();
    if (normalized === 'yes')
        return true;
    if (normalized === 'no')
        return false;
    return undefined;
}
function validateRequiredRows(rows, file, violations) {
    const capabilities = new Set(rows.map((row) => row.capability));
    for (const capability of REQUIRED_REFERENCE_PARITY_CAPABILITIES) {
        if (!capabilities.has(capability)) {
            violations.push({
                file,
                message: `Missing required replacement parity row: ${capability}.`,
            });
        }
    }
}
function validateProofArtifacts(rows, root, file, violations) {
    for (const row of rows) {
        if (!row.proofArtifact || row.proofArtifact.toLowerCase() === 'none') {
            violations.push({
                file,
                message: `Replacement parity row "${row.capability}" must name a proof artifact.`,
            });
            continue;
        }
        const artifact = stripMarkdownLink(row.proofArtifact);
        if (!artifact.startsWith('docs/') &&
            !artifact.startsWith('src/') &&
            !artifact.startsWith('blueprints/')) {
            violations.push({
                file,
                message: `Replacement parity row "${row.capability}" proof artifact must be repo-local.`,
            });
            continue;
        }
        if (!existsSync(resolve(root, artifact))) {
            violations.push({
                file,
                message: `Replacement parity row "${row.capability}" proof artifact is missing: ${artifact}.`,
            });
        }
    }
}
function validateHostCapabilityCrosswalk(rows, file, violations) {
    for (const violation of validateReplacementParityCapabilityCrosswalk(rows)) {
        violations.push({
            file,
            message: violation.message,
        });
    }
}
function validateReleaseCriticalRows(rows, file, violations) {
    for (const capability of REQUIRED_REFERENCE_PARITY_CAPABILITIES) {
        const row = rows.find((candidate) => candidate.capability === capability);
        if (row && !row.requiredForRelease) {
            violations.push({
                file,
                message: `Required replacement parity row "${capability}" cannot opt out of release blocking.`,
            });
        }
    }
}
function validateFullPassedProofStrength(rows, root, file, violations) {
    for (const row of rows) {
        if (row.supportLevel !== 'full' || row.status !== 'passed')
            continue;
        const artifact = stripMarkdownLink(row.proofArtifact);
        if (!artifact.startsWith('src/') ||
            !/\.(test|integration\.test|e2e\.test)\.ts$/u.test(artifact)) {
            violations.push({
                file,
                message: `Full passed replacement parity row "${row.capability}" must point to a concrete repo test or audit proof artifact.`,
            });
            continue;
        }
        const capability = row.capability;
        const markers = FULL_PASSED_PROOF_MARKERS[capability];
        if (!markers)
            continue;
        const content = existsSync(resolve(root, artifact)) ? readFileSync(resolve(root, artifact), 'utf8') : '';
        const missingMarkers = markers.filter((marker) => !content.includes(marker));
        if (missingMarkers.length > 0) {
            violations.push({
                file,
                message: `Full passed replacement parity row "${row.capability}" proof artifact is too weak; missing evidence marker(s): ${missingMarkers.join(', ')}.`,
            });
        }
    }
}
function stripMarkdownLink(value) {
    const match = /^\[[^\]]+\]\(([^)]+)\)$/u.exec(value.trim());
    return match?.[1] ?? value.trim();
}
//# sourceMappingURL=reference-parity-matrix.js.map