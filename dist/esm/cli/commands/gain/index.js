import Database from 'better-sqlite3';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
export function queryContextModeStats(sessionDirs) {
    const home = homedir();
    const dirs = sessionDirs ?? [
        join(home, '.claude', 'context-mode', 'sessions'),
        join(home, '.config', 'opencode', 'context-mode', 'sessions'),
    ];
    let sessions = 0;
    let events = 0;
    let compacts = 0;
    let found = false;
    for (const dir of dirs) {
        if (!existsSync(dir))
            continue;
        let files;
        try {
            files = readdirSync(dir).filter((f) => f.endsWith('.db'));
        }
        catch {
            continue;
        }
        for (const file of files) {
            try {
                const db = new Database(join(dir, file), { readonly: true });
                const row = db
                    .prepare('SELECT COUNT(*) as s, COALESCE(SUM(event_count),0) as e, COALESCE(SUM(compact_count),0) as c FROM session_meta')
                    .get();
                db.close();
                if (row) {
                    sessions += row.s;
                    events += row.e;
                    compacts += row.c;
                    found = true;
                }
            }
            catch {
                // unreadable db — skip
            }
        }
    }
    return found ? { sessions, events, compacts } : null;
}
export function runGain(sessionDirs) {
    // ── RTK Token Savings ───────────────────────────────────────────────
    console.log('\n── RTK Token Savings ──────────────────────────────────────────');
    const rtk = spawnSync('rtk', ['gain'], { stdio: 'inherit' });
    if (rtk.error) {
        const err = rtk.error;
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            console.log('  RTK not installed.');
            console.log('  Enable: ak setup --with rtk  |  Manual: brew install rtk');
        }
        else {
            throw err;
        }
    }
    // ── context-mode Context Savings ────────────────────────────────────
    console.log('\n── context-mode Context Savings ───────────────────────────────');
    const ctx = queryContextModeStats(sessionDirs);
    if (ctx) {
        console.log(`  Sessions tracked:   ${ctx.sessions.toLocaleString()}`);
        console.log(`  Events kept out:    ${ctx.events.toLocaleString()}`);
        console.log(`  /compact rescues:   ${ctx.compacts}`);
        console.log('');
        console.log('  Full $ breakdown: run ctx_stats in Claude Code');
    }
    else {
        console.log('  context-mode not installed or no sessions yet.');
        console.log('  Install: claude plugin install context-mode');
    }
    console.log('');
    return rtk.error ? 0 : (rtk.status ?? 0);
}
export function registerGainCommand(cli) {
    cli.command('gain', 'Show RTK token savings + context-mode context savings').action(() => {
        return runGain();
    });
}
//# sourceMappingURL=index.js.map