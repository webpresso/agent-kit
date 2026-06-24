import { existsSync } from 'node:fs';
import path from 'node:path';
export function validateTrustEvidence(repoRoot, dossier) {
    const violations = [];
    const ids = new Set();
    const derived = new Map();
    for (const claim of dossier.claims) {
        if (ids.has(claim.id))
            violations.push({
                section: 'Material Claims',
                claimId: claim.id,
                message: `duplicate claim id ${claim.id}`,
            });
        ids.add(claim.id);
    }
    for (const claim of dossier.claims) {
        if (claim.evidence.trim().length === 0) {
            violations.push({
                section: 'Material Claims',
                claimId: claim.id,
                message: 'claim evidence is required',
            });
            continue;
        }
        const tokens = claim.evidence
            .split(';')
            .map((token) => token.trim())
            .filter(Boolean);
        for (const token of tokens) {
            if (token.startsWith('repo:')) {
                const rel = token.slice('repo:'.length).trim();
                if (path.isAbsolute(rel) || rel.split(/[\\/]+/u).includes('..'))
                    violations.push({
                        section: 'Material Claims',
                        claimId: claim.id,
                        message: `repo evidence must stay under repo root: ${rel}`,
                    });
                else if (!existsSync(path.join(repoRoot, rel)))
                    violations.push({
                        section: 'Material Claims',
                        claimId: claim.id,
                        message: `repo evidence path does not exist: ${rel}`,
                    });
            }
            else if (token.startsWith('web:')) {
                const match = /^web:(\S+)\s+\((\d{4}-\d{2}-\d{2})\)$/u.exec(token);
                if (!match)
                    violations.push({
                        section: 'Material Claims',
                        claimId: claim.id,
                        message: `web evidence must include URL and date: ${token}`,
                    });
                else {
                    const url = match[1] ?? '';
                    try {
                        new URL(url);
                    }
                    catch {
                        violations.push({
                            section: 'Material Claims',
                            claimId: claim.id,
                            message: `invalid web evidence URL: ${url}`,
                        });
                    }
                }
            }
            else if (token.startsWith('derived:')) {
                const refs = token
                    .slice('derived:'.length)
                    .split(',')
                    .map((ref) => ref.trim())
                    .filter(Boolean);
                derived.set(claim.id, refs);
                for (const ref of refs) {
                    if (ref === claim.id)
                        violations.push({
                            section: 'Material Claims',
                            claimId: claim.id,
                            message: 'derived evidence cannot reference itself',
                        });
                    if (!ids.has(ref))
                        violations.push({
                            section: 'Material Claims',
                            claimId: claim.id,
                            message: `unknown derived claim id: ${ref}`,
                        });
                }
            }
            else {
                violations.push({
                    section: 'Material Claims',
                    claimId: claim.id,
                    message: `unknown evidence token: ${token}`,
                });
            }
        }
    }
    for (const id of ids) {
        if (hasCycle(id, derived, new Set(), new Set()))
            violations.push({
                section: 'Material Claims',
                claimId: id,
                message: 'derived evidence cycle detected',
            });
    }
    return violations;
}
function hasCycle(id, graph, visiting, visited) {
    if (visiting.has(id))
        return true;
    if (visited.has(id))
        return false;
    visiting.add(id);
    for (const next of graph.get(id) ?? [])
        if (hasCycle(next, graph, visiting, visited))
            return true;
    visiting.delete(id);
    visited.add(id);
    return false;
}
//# sourceMappingURL=evidence.js.map