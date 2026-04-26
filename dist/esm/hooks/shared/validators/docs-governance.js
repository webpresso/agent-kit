import { getFilePath } from '../types.js';
const ALLOWED_ROOT_FILES = new Set(['docs/README.md', 'docs/FILE-TYPE-TAXONOMY.md']);
export function validateDocsGovernance(input, skipEnvVar = 'DOCS_GOVERNANCE_SKIP') {
    const filePath = getFilePath(input);
    if (typeof process !== 'undefined' && process.env?.[skipEnvVar] === '1') {
        return { validator: 'docs-governance', passed: true, skipped: true, skipReason: 'Bypass enabled' };
    }
    if (!filePath)
        return { validator: 'docs-governance', passed: true };
    const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    if (!normalized.startsWith('docs/'))
        return { validator: 'docs-governance', passed: true };
    if (!normalized.endsWith('.md'))
        return { validator: 'docs-governance', passed: true };
    const isRootLevel = /^docs\/[^/]+\.md$/.test(normalized);
    if (isRootLevel && !ALLOWED_ROOT_FILES.has(normalized)) {
        return {
            validator: 'docs-governance',
            passed: false,
            message: `Root docs/*.md files must be README.md or FILE-TYPE-TAXONOMY.md. Got: ${normalized}`,
        };
    }
    return { validator: 'docs-governance', passed: true };
}
//# sourceMappingURL=docs-governance.js.map