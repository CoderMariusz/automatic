/**
 * Claude Workflow Runner - Story Delivery
 * 
 * Uruchamia Claude Code CLI z flagą -p dla każdego kroku.
 * Używa execSync (synchroniczne) - bardziej niezawodne.
 * 
 * Flagi:
 *   --dry-run       Tylko loguj, nie wykonuj Claude
 *   --skip-checks   Pomiń check bundles
 *   --step=P3a      Uruchom tylko konkretny step
 *   --check=quick   Uruchom tylko bundle 'quick' (tsc)
 *   --check=full    Uruchom tylko bundle 'full' (tsc + eslint + build)
 *   --check-all     Uruchom wszystkie bundles
 *   --autofix       Uruchom autofix (eslint --fix, prettier)
 *   --setup         Sprawdź i zainstaluj brakujące dependencies
 *   --help          Pokaż pomoc
 */

import { execSync, exec } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);

// ... existing code ...

// ============== CLAUDE ==============

async function runClaudeAsync(prompt: string, timeoutSec: number, stepId: string): Promise<{ ok: boolean; output: string; error?: string }> {
    if (DRY_RUN) {
        log(`[DRY-RUN] [${stepId}] Would execute Claude with prompt`);
        console.log('\x1b[90m' + prompt.slice(0, 200) + '...\x1b[0m');
        return { ok: true, output: '[dry-run output]' };
    }

    if (MOCK_MODE) {
        log(`[MOCK] [${stepId}] Simulating Claude (2s delay)...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { ok: true, output: '===NEXT_STEP_READY===\nMock successful.' };
    }

    const simpleId = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const safeStepId = stepId.replace(/[^a-zA-Z0-9-]/g, '_');
    const promptFile = resolve(__dirname, `.prompt.${safeStepId}.tmp`);
    writeFileSync(promptFile, prompt);

    // Save raw input
    if (existsSync(RAW_LOG_DIR)) {
        writeFileSync(resolve(RAW_LOG_DIR, `${simpleId}_${safeStepId}_input.md`), prompt);
    }

    log(`[${stepId}] Executing Claude (timeout: ${timeoutSec}s)...`);
    // console.log('\x1b[90m--- output start ---\x1b[0m'); // Disabled real-time log in parallel mode to avoid interleaved garbage

    let output = '';
    let success = false;
    let errorMsg: string | undefined;

    try {
        const isWindows = process.platform === 'win32';
        const catCmd = isWindows ? 'type' : 'cat';
        const cmd = `${catCmd} "${promptFile}" | claude -p - --dangerously-skip-permissions`;

        const result = await execAsync(cmd, {
            timeout: timeoutSec * 1000,
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            shell: undefined // Use default shell
        });

        output = result.stdout;
        success = true;

    } catch (err: any) {
        output = err.stdout || '';
        errorMsg = err.message;
        success = output.length > 50; // Consider partial success if some output
    }

    // console.log(output); // Log output at end
    // console.log('\x1b[90m--- output end ---\x1b[0m');

    // Save raw output
    if (existsSync(RAW_LOG_DIR)) {
        writeFileSync(resolve(RAW_LOG_DIR, `${simpleId}_${safeStepId}_${success ? 'ok' : 'fail'}.md`), output + (errorMsg ? `\n\nERROR: ${errorMsg}` : ''));
    }

    return { ok: success, output, error: errorMsg };
}
const __dirname = dirname(__filename);

// ============== CLI FLAGS ==============

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_CHECKS = args.includes('--skip-checks');
const ONLY_STEP = args.find((a: string) => a.startsWith('--step='))?.split('=')[1];
const CHECK_BUNDLE = args.find((a: string) => a.startsWith('--check='))?.split('=')[1];
const CHECK_ALL = args.includes('--check-all');
const RUN_AUTOFIX = args.includes('--autofix');
const RUN_SETUP = args.includes('--setup');
const MOCK_MODE = args.includes('--mock');
const PLAN_FILE = args.find((a: string) => a.startsWith('--plan='))?.split('=')[1] || 'plan.yaml';
const SHOW_HELP = args.includes('--help') || args.includes('-h');

if (SHOW_HELP) {
    console.log(`
Claude Workflow Runner - Story Delivery

Usage: npm start -- [flags]

Flags:
  --dry-run       Tylko loguj, nie wykonuj Claude
  --mock          Symuluj wykonanie (wait 2s) bez dzwonienia do Claude
  --skip-checks   Pomiń check bundles
  --plan=file.yml Użyj innego pliku planu (default: plan.yaml)
  --step=P3a      Uruchom tylko konkretny step
  --check=quick   Uruchom bundle 'quick' (tsc)
  --check=full    Uruchom bundle 'full' (tsc + eslint + build)
  --check-all     Uruchom wszystkie bundles
  --autofix       Uruchom autofix (eslint --fix, prettier)
  --setup         Sprawdź i zainstaluj brakujące dependencies
  --help, -h      Pokaż tę pomoc

Examples:
  npm start                      # Uruchom workflow
  npm start -- --mock --plan=tests/p.yaml  # Test symulacji
  npm start -- --check=quick     # Tylko tsc
`);
    process.exit(0);
}

if (DRY_RUN) console.log('\x1b[33m[DRY-RUN MODE]\x1b[0m');
if (MOCK_MODE) console.log('\x1b[35m[MOCK MODE - SIMULATED AI]\x1b[0m');
if (SKIP_CHECKS) console.log('\x1b[33m[SKIP-CHECKS MODE]\x1b[0m');
if (ONLY_STEP) console.log(`\x1b[33m[ONLY STEP: ${ONLY_STEP}]\x1b[0m`);
if (CHECK_BUNDLE) console.log(`\x1b[33m[CHECK MODE: ${CHECK_BUNDLE}]\x1b[0m`);
if (CHECK_ALL) console.log('\x1b[33m[CHECK-ALL MODE]\x1b[0m');
if (RUN_AUTOFIX) console.log('\x1b[33m[AUTOFIX MODE]\x1b[0m');
if (RUN_SETUP) console.log('\x1b[33m[SETUP MODE]\x1b[0m');
if (PLAN_FILE !== 'plan.yaml') console.log(`\x1b[36m[PLAN: ${PLAN_FILE}]\x1b[0m`);

// ============== RESUME MODE ==============

const RUN_RESUME = args.includes('--resume');

interface RunnerState {
    lastRun: string;
    processedStories: string[];
    currentStory?: string;
}

const STATE_FILE = resolve(__dirname, 'state.json');

function loadState(): RunnerState {
    if (existsSync(STATE_FILE)) {
        return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
    return { lastRun: new Date().toISOString(), processedStories: [] };
}

function saveState(state: RunnerState) {
    state.lastRun = new Date().toISOString();
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ============== TYPES ==============

interface CheckCmd {
    name: string;
    cmd: string[];
}

interface Step {
    id: string;
    file: string;
    agent?: string;
    timeout_sec?: number;
    skip_when?: string | null;
    type?: string;
    post_checks?: string;
    parallel_group?: string;
    depends_on?: string[];
}

interface Story {
    story_id: string;
    epic: string;
    type: 'backend' | 'frontend' | 'fullstack';
    content: string;
}

interface Checkpoint {
    story_id: string;
    epic: string;
    type: string;
    status: string;
    phases: Record<string, string | null>;
}

interface PlanConfig {
    version: number;
    runner: {
        claude_cmd: string[];
        ready_marker: string;
        blocked_marker: string;
        default_timeout_sec: number;
    };
    stories: {
        input_folder: string;
        processed_folder: string;
        checkpoint_folder: string;
    };
    checks: {
        enabled: boolean;
        bundles: Record<string, CheckCmd[]>;
    };
    autofix: {
        enabled: boolean;
        commands: CheckCmd[];
    };
    steps: Step[];
    fix_step: Step;
}

// ============== LOGGING ==============

const LOG_DIR = resolve(__dirname, 'logs');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_FOLDER = resolve(LOG_DIR, RUN_ID);
const TIMELINE_LOG = resolve(RUN_FOLDER, 'timeline.log');
const RAW_LOG_DIR = resolve(RUN_FOLDER, 'raw');

function setupLogging() {
    if (DRY_RUN) return;
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR);
    if (!existsSync(RUN_FOLDER)) mkdirSync(RUN_FOLDER);
    if (!existsSync(RAW_LOG_DIR)) mkdirSync(RAW_LOG_DIR);

    // Initial log
    writeFileSync(TIMELINE_LOG, `Run ID: ${RUN_ID}\nDate: ${new Date().toISOString()}\n\n`);
}

function logToFile(msg: string) {
    if (DRY_RUN) return;
    try {
        if (!existsSync(RUN_FOLDER)) setupLogging();
        // Remove color codes for file log
        const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, '');
        // Append to timeline.log (using a workaround for appendFileSync since I didn't import it)
        const oldContent = existsSync(TIMELINE_LOG) ? readFileSync(TIMELINE_LOG, 'utf-8') : '';
        writeFileSync(TIMELINE_LOG, oldContent + cleanMsg + '\n');
    } catch { }
}

const log = (msg: string) => {
    console.log(`\x1b[36m[${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`);
    logToFile(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
};
const logStep = (msg: string) => {
    console.log(`\x1b[33m>>> ${msg}\x1b[0m`);
    logToFile(`>>> ${msg}`);
};
const logOk = (msg: string) => {
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
    logToFile(`✓ ${msg}`);
};
const logErr = (msg: string) => {
    console.log(`\x1b[31m✗ ${msg}\x1b[0m`);
    logToFile(`✗ ${msg}`);
};
const logCheck = (msg: string) => {
    console.log(`\x1b[35m[CHECK] ${msg}\x1b[0m`);
    logToFile(`[CHECK] ${msg}`);
};

// ============== HELPERS ==============

function loadPlan(): PlanConfig {
    return parseYaml(readFileSync(resolve(__dirname, PLAN_FILE), 'utf-8')) as PlanConfig;
}

// ============== STORY ==============

function loadStories(plan: PlanConfig): Story[] {
    const dir = resolve(__dirname, plan.stories.input_folder);
    if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); return []; }

    return readdirSync(dir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.md'))
        .map(f => {
            const content = readFileSync(resolve(dir, f), 'utf-8');
            let p: any = {}; try { p = parseYaml(content); } catch { }
            return {
                story_id: p.story_id || basename(f).replace(/\.(yaml|md)$/, ''),
                epic: p.epic || 'unknown',
                type: p.type || 'fullstack',
                content
            };
        });
}

// ============== CHECKPOINT ==============

let checkpoint: Checkpoint | null = null;

function loadCheckpoint(story: Story, plan: PlanConfig): Checkpoint {
    const dir = resolve(__dirname, plan.stories.checkpoint_folder);
    const path = resolve(dir, `${story.story_id}.yaml`);

    if (existsSync(path)) return parseYaml(readFileSync(path, 'utf-8')) as Checkpoint;

    return {
        story_id: story.story_id,
        epic: story.epic,
        type: story.type,
        status: 'in_progress',
        phases: { P1: null, P2: null, P3a: null, P3b: null, P3c: null, P3d: null, P4: null, P5: null, P6: null, P7: null }
    };
}

function saveCheckpoint(cp: Checkpoint, plan: PlanConfig) {
    const dir = resolve(__dirname, plan.stories.checkpoint_folder);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${cp.story_id}.yaml`), stringifyYaml(cp));
}

// ============== CHECK BUNDLES ==============

interface CheckResult {
    name: string;
    passed: boolean;
    output: string;
}

function runCheckBundle(bundleName: string, plan: PlanConfig): { allPassed: boolean; results: CheckResult[] } {
    if (SKIP_CHECKS) {
        logCheck(`Skipping ${bundleName} (--skip-checks)`);
        return { allPassed: true, results: [] };
    }

    if (!plan.checks.enabled) {
        logCheck('Checks disabled in plan.yaml');
        return { allPassed: true, results: [] };
    }

    const bundle = plan.checks.bundles[bundleName];
    if (!bundle) {
        logErr(`Check bundle '${bundleName}' not found`);
        return { allPassed: false, results: [] };
    }

    logCheck(`Running ${bundleName} bundle (${bundle.length} checks)...`);

    const results: CheckResult[] = [];

    for (const check of bundle) {
        const cmdStr = check.cmd.join(' ');
        logCheck(`  ${check.name}: ${cmdStr}`);

        if (DRY_RUN) {
            results.push({ name: check.name, passed: true, output: '[dry-run]' });
            continue;
        }

        try {
            const output = execSync(cmdStr, {
                encoding: 'utf-8',
                timeout: 300000,
                cwd: process.cwd()
            });

            results.push({ name: check.name, passed: true, output });
            logOk(`  ${check.name}: PASS`);

        } catch (err: any) {
            const output = (err.stdout || '') + (err.stderr || '');
            results.push({ name: check.name, passed: false, output });
            logErr(`  ${check.name}: FAIL`);
            console.log('\x1b[90m' + output.slice(0, 500) + '\x1b[0m');
        }
    }

    const allPassed = results.every(r => r.passed);
    logCheck(`Bundle ${bundleName}: ${allPassed ? 'ALL PASS ✓' : 'SOME FAILED ✗'}`);

    return { allPassed, results };
}

// ============== AUTOFIX ==============

function runAutofix(plan: PlanConfig): boolean {
    if (!plan.autofix.enabled) {
        log('Autofix disabled');
        return false;
    }

    logCheck('Running autofix...');
    let anyFixed = false;

    for (const fix of plan.autofix.commands) {
        const cmdStr = fix.cmd.join(' ');
        logCheck(`  ${fix.name}: ${cmdStr}`);

        if (DRY_RUN) continue;

        try {
            execSync(cmdStr, {
                encoding: 'utf-8',
                timeout: 120000,
                cwd: process.cwd()
            });
            anyFixed = true;
            logOk(`  ${fix.name}: done`);
        } catch (err: any) {
            const errMsg = err.stderr || err.message || 'Unknown error';
            logErr(`  ${fix.name}: failed - ${errMsg.split('\n')[0]}`);
        }
    }

    return anyFixed;
}

// ============== PFIX - AI ERROR REPAIR ==============

function runPFix(errors: string, plan: PlanConfig): boolean {
    logCheck('Running pFix - AI Error Repair...');

    // Load pFix instruction
    const pFixPath = resolve(__dirname, plan.fix_step.file);
    if (!existsSync(pFixPath)) {
        logErr(`pFix instruction not found: ${pFixPath}`);
        return false;
    }

    let instruction = readFileSync(pFixPath, 'utf-8');

    // Append errors
    instruction += `\n\n## LINT ERRORS TO FIX\n\`\`\`\n${errors}\n\`\`\``;
    instruction += `\n\n## CONTRACT\nFix all errors. When done, end with: ===NEXT_STEP_READY===`;

    const timeout = plan.fix_step.timeout_sec || 7200; // 2h default for pFix
    const result = runClaude(instruction, timeout);

    if (result.ok) {
        logOk('pFix completed');
        return true;
    } else {
        logErr(`pFix failed: ${result.error}`);
        return false;
    }
}

// ============== CLAUDE ==============

function runClaude(prompt: string, timeoutSec: number): { ok: boolean; output: string; error?: string } {
    if (DRY_RUN) {
        log('[DRY-RUN] Would execute Claude with prompt');
        console.log('\x1b[90m' + prompt.slice(0, 200) + '...\x1b[0m');
        return { ok: true, output: '[dry-run output]' };
    }

    const simpleId = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const promptFile = resolve(__dirname, '.prompt.tmp');
    writeFileSync(promptFile, prompt);

    // Save raw input
    if (existsSync(RAW_LOG_DIR)) {
        writeFileSync(resolve(RAW_LOG_DIR, `${simpleId}_input.md`), prompt);
    }

    log(`Executing Claude (timeout: ${timeoutSec}s)...`);
    console.log('\x1b[90m--- output start ---\x1b[0m');

    let output = '';
    let success = false;
    let errorMsg: string | undefined;

    try {
        const isWindows = process.platform === 'win32';
        const catCmd = isWindows ? 'type' : 'cat';
        const cmd = `${catCmd} "${promptFile}" | claude -p - --dangerously-skip-permissions`;

        output = execSync(cmd, {
            timeout: timeoutSec * 1000,
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });
        success = true;

    } catch (err: any) {
        output = err.stdout || '';
        errorMsg = err.message;
        success = output.length > 50; // Consider partial success if some output
    }

    console.log(output);
    console.log('\x1b[90m--- output end ---\x1b[0m');

    // Save raw output
    if (existsSync(RAW_LOG_DIR)) {
        writeFileSync(resolve(RAW_LOG_DIR, `${simpleId}_${success ? 'ok' : 'fail'}.md`), output + (errorMsg ? `\n\nERROR: ${errorMsg}` : ''));
    }

    return { ok: success, output, error: errorMsg };
}

// ============== STEPS ==============

function shouldSkip(step: Step, story: Story): string | null {
    if (!step.skip_when) return null;
    if (step.skip_when === 'backend-only' && story.type === 'backend') return 'backend-only';
    if (step.skip_when === 'frontend-only' && story.type === 'frontend') return 'frontend-only';
    return null;
}

function processAttachments(content: string): string {
    const lines = content.split('\n');
    const processedLines: string[] = [];

    for (const line of lines) {
        // Match ATTACH: path/to/file[:range]
        const match = line.match(/^ATTACH:\s*([^\s:]+)(?::([0-9-]*))?\s*$/);

        if (match) {
            const relPath = match[1];
            const rangeSpec = match[2];
            const absPath = resolve(__dirname, relPath);

            if (existsSync(absPath)) {
                try {
                    const fileContent = readFileSync(absPath, 'utf-8');
                    const fileLines = fileContent.split('\n');
                    let subset = fileLines;
                    let rangeInfo = '';

                    if (rangeSpec) {
                        if (rangeSpec.startsWith('-')) {
                            // Tail: -N e.g. -50
                            const count = parseInt(rangeSpec.slice(1));
                            subset = fileLines.slice(-count);
                            rangeInfo = ` (Tail ${count})`;
                        } else if (rangeSpec.endsWith('-')) {
                            // Start to end: N- e.g. 10-
                            const start = parseInt(rangeSpec.slice(0, -1));
                            subset = fileLines.slice(Math.max(0, start - 1));
                            rangeInfo = ` (Line ${start}+)`;
                        } else if (rangeSpec.includes('-')) {
                            // Range: N-M e.g. 10-20
                            const parts = rangeSpec.split('-');
                            const start = parseInt(parts[0]);
                            const end = parseInt(parts[1]);
                            subset = fileLines.slice(Math.max(0, start - 1), end);
                            rangeInfo = ` (Lines ${start}-${end})`;
                        }
                    }

                    processedLines.push(`\n**Attached${rangeInfo}: ${relPath}**`);
                    processedLines.push('```' + (relPath.split('.').pop() || '') + '\n' + subset.join('\n') + '\n```');
                    log(`Attached ${relPath}${rangeInfo}`);

                } catch (err: any) {
                    logErr(`Failed to attach ${relPath}: ${err.message}`);
                    processedLines.push(`[ERROR: Could not read attached file ${relPath}]`);
                }
            } else {
                logErr(`Attachment not found: ${absPath}`);
                processedLines.push(`[MISSING ATTACHMENT: ${relPath}]`);
            }
        } else {
            processedLines.push(line);
        }
    }
    return processedLines.join('\n');
}

function loadInstruction(step: Step, story: Story): string {
    const path = resolve(__dirname, step.file);
    if (!existsSync(path)) throw new Error(`Not found: ${path}`);

    let content = readFileSync(path, 'utf-8');

    // Process ATTACH markers
    content = processAttachments(content);

    content += `\n\n## STORY\n\`\`\`yaml\n${story.content}\n\`\`\``;
    content += `\n\n## CONTRACT\nWhen done, end with: ===NEXT_STEP_READY===`;

    return content;
}

async function runStepAsync(step: Step, story: Story, plan: PlanConfig): Promise<boolean> {
    console.log('');
    logStep(`${step.id} | ${step.agent || 'agent'}`);

    const instruction = loadInstruction(step, story);
    const timeout = step.timeout_sec || plan.runner.default_timeout_sec;
    const result = await runClaudeAsync(instruction, timeout, step.id);

    const time = new Date().toISOString().slice(11, 16);

    if (result.ok) {
        checkpoint!.phases[step.id] = `✓ ${step.agent || 'agent'} ${time}`;
        saveCheckpoint(checkpoint!, plan);
        logOk(`${step.id} completed`);

        // Run post_checks if defined
        if (step.post_checks) {
            console.log('');
            const checkResult = runCheckBundle(step.post_checks, plan);

            if (!checkResult.allPassed) {
                // Try autofix first
                const fixed = runAutofix(plan);

                if (fixed) {
                    // Re-run checks
                    const recheck = runCheckBundle(step.post_checks, plan);
                    if (!recheck.allPassed) {
                        // Still failing? Run pFix with error output
                        const errorOutput = recheck.results
                            .filter(r => !r.passed)
                            .map(r => `=== ${r.name} ===\n${r.output}`)
                            .join('\n\n');

                        const pFixOk = runPFix(errorOutput, plan);

                        if (pFixOk) {
                            // Re-run checks after pFix
                            const finalCheck = runCheckBundle(step.post_checks, plan);
                            if (!finalCheck.allPassed) {
                                checkpoint!.phases[step.id + '-check'] = `✗ ${time} pfix-failed`;
                                saveCheckpoint(checkpoint!, plan);
                                return false;
                            }
                        } else {
                            checkpoint!.phases[step.id + '-check'] = `✗ ${time} pfix-error`;
                            saveCheckpoint(checkpoint!, plan);
                            return false;
                        }
                    }
                } else {
                    // No autofix available, try pFix directly
                    const errorOutput = checkResult.results
                        .filter(r => !r.passed)
                        .map(r => `=== ${r.name} ===\n${r.output}`)
                        .join('\n\n');

                    const pFixOk = runPFix(errorOutput, plan);

                    if (!pFixOk) {
                        checkpoint!.phases[step.id + '-check'] = `✗ ${time} check-failed`;
                        saveCheckpoint(checkpoint!, plan);
                        return false;
                    }
                }
            }

            checkpoint!.phases[step.id + '-check'] = `✓ ${time}`;
            saveCheckpoint(checkpoint!, plan);
        }

        return true;
    } else {
        checkpoint!.phases[step.id] = `✗ ${time} ${result.error}`;
        saveCheckpoint(checkpoint!, plan);
        logErr(`${step.id} failed: ${result.error}`);
        return false;
    }
}

// ============== PARALLEL EXECUTION ==============

async function runParallelGroup(steps: Step[], story: Story, plan: PlanConfig): Promise<boolean> {
    log(`Running parallel group: ${steps.map(s => s.id).join(', ')}`);

    // Simple DAG scheduler
    const pending = [...steps];
    const executing = new Map<string, Promise<boolean>>();
    const completed = new Set<string>();
    let failed = false;

    while (pending.length > 0 || executing.size > 0) {
        // Find runnable steps
        for (let i = pending.length - 1; i >= 0; i--) {
            const step = pending[i];

            // Checks for dependencies: if step has deps, all must be in 'completed' OR not in the parallel group at all (implied external/previous)
            const deps = step.depends_on || [];
            if (deps.every(d => completed.has(d) || !steps.some(s => s.id === d))) {
                // Launch
                pending.splice(i, 1);

                log(`Starting parallel step: ${step.id}`);
                const p = runStepAsync(step, story, plan).then(ok => {
                    log(ok ? `${step.id} finished (OK)` : `${step.id} finished (FAIL)`);
                    if (ok) completed.add(step.id);
                    else failed = true;
                    executing.delete(step.id);
                    return ok;
                });

                executing.set(step.id, p);
            }
        }

        if (executing.size === 0 && pending.length > 0) {
            logErr('Deadlock in parallel group dependencies: ' + pending.map(s => s.id).join(', '));
            return false;
        }

        if (executing.size === 0 && pending.length === 0) break;

        // Wait for at least one to finish
        // We use Promise.race on the map values
        await Promise.race(executing.values());

        if (failed) return false; // Abort early if one fails
    }

    return !failed;
}

// ============== MAIN ==============

async function main() {
    console.log('\n\x1b[1m══════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[1m   Claude Workflow Runner - Story Delivery\x1b[0m');
    console.log('\x1b[1m══════════════════════════════════════════════════\x1b[0m\n');

    const plan = loadPlan();
    log(`Loaded ${plan.steps.length} steps`);

    // ============== SETUP MODE ==============
    // Check and install missing dependencies

    if (RUN_SETUP) {
        log('Checking dependencies...');

        const requiredPkgs = ['typescript', 'eslint', 'prettier', '@eslint/js'];
        const missingPkgs: string[] = [];

        for (const pkg of requiredPkgs) {
            try {
                execSync(`pnpm list ${pkg}`, { encoding: 'utf-8', stdio: 'pipe' });
                logOk(`  ${pkg}: installed`);
            } catch {
                logErr(`  ${pkg}: missing`);
                missingPkgs.push(pkg);
            }
        }

        // Check for node_modules
        if (!existsSync(resolve(__dirname, 'node_modules'))) {
            log('Installing node_modules...');
            try {
                execSync('pnpm install', { encoding: 'utf-8', stdio: 'inherit' });
                logOk('node_modules installed');
            } catch (err) {
                logErr('Failed to install node_modules');
            }
        }

        // Install missing
        if (missingPkgs.length > 0) {
            log(`Installing missing: ${missingPkgs.join(', ')}`);
            try {
                execSync(`pnpm add -D ${missingPkgs.join(' ')}`, { encoding: 'utf-8', stdio: 'inherit' });
                logOk('Dependencies installed');
            } catch (err) {
                logErr('Failed to install some packages');
            }
        }

        // Check for eslint config
        if (!existsSync(resolve(__dirname, 'eslint.config.js'))) {
            logErr('Missing eslint.config.js - create one for ESLint v9+');
        } else {
            logOk('eslint.config.js exists');
        }

        // Check for Claude CLI
        try {
            execSync('claude --version', { encoding: 'utf-8', stdio: 'pipe' });
            logOk('Claude CLI available');
        } catch {
            logErr('Claude CLI not found - install from https://claude.ai/cli');
        }

        logOk('Setup complete');
        return;
    }

    // ============== CHECK-ONLY MODE ==============
    // If --check or --check-all or --autofix, run those and exit

    if (RUN_AUTOFIX) {
        runAutofix(plan);
        logOk('Autofix complete');
        return;
    }

    if (CHECK_BUNDLE) {
        const result = runCheckBundle(CHECK_BUNDLE, plan);
        if (result.allPassed) {
            logOk(`Bundle ${CHECK_BUNDLE}: ALL PASS`);
        } else {
            logErr(`Bundle ${CHECK_BUNDLE}: FAILED`);
            process.exit(1);
        }
        return;
    }

    if (CHECK_ALL) {
        log('Running all check bundles...');
        let allOk = true;
        for (const bundleName of Object.keys(plan.checks.bundles)) {
            const result = runCheckBundle(bundleName, plan);
            if (!result.allPassed) allOk = false;
        }
        if (allOk) {
            logOk('All bundles passed');
        } else {
            logErr('Some bundles failed');
            process.exit(1);
        }
        return;
    }


    // ============== NORMAL WORKFLOW ==============

    let runnerState = loadState();

    if (RUN_RESUME) {
        log(`Resuming from state (processed: ${runnerState.processedStories.length})...`);
    } else {
        // Reset state if not resuming
        runnerState = { lastRun: new Date().toISOString(), processedStories: [] };
        saveState(runnerState);
    }

    const stories = loadStories(plan);
    log(`Found ${stories.length} pending stories`);

    if (!stories.length) {
        log('No stories in stories/pending/');
        return;
    }

    // Ping test (skip in dry-run)
    if (!DRY_RUN) {
        log('Testing Claude CLI...');
        const ping = await runClaudeAsync('Say: OK', 120, 'PING');
        if (!ping.ok && ping.output.length < 10) {
            logErr('Claude not responding');
            process.exit(1);
        }
        logOk('Claude responding');
    }

    // Process stories
    for (const story of stories) {
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file - exiting');
            break;
        }

        // Skip processed stories if resuming
        if (RUN_RESUME && runnerState.processedStories.includes(story.story_id)) {
            continue;
        }

        // Update state current story
        runnerState.currentStory = story.story_id;
        saveState(runnerState);

        console.log('\n' + '='.repeat(60));
        logStep(`Story: ${story.story_id} (${story.type})`);
        console.log('='.repeat(60));

        checkpoint = loadCheckpoint(story, plan);
        let storyFailed = false;

        let i = 0;
        while (i < plan.steps.length) {
            if (existsSync(resolve(__dirname, 'STOP'))) break;

            const step = plan.steps[i];

            // Skip check-only steps (handled by post_checks)
            if (step.type === 'check') {
                i++;
                continue;
            }

            // If --step flag, only run that step
            if (ONLY_STEP && step.id !== ONLY_STEP) {
                i++;
                continue;
            }

            // Check if start of parallel group
            if (step.parallel_group && !ONLY_STEP) {
                const groupName = step.parallel_group;
                const groupSteps: Step[] = [];

                // Collect all steps in this group
                let j = i;
                while (j < plan.steps.length && plan.steps[j].parallel_group === groupName) {
                    groupSteps.push(plan.steps[j]);
                    j++;
                }

                if (groupSteps.length > 0) {
                    const activeSteps: Step[] = [];
                    for (const s of groupSteps) {
                        const skip = shouldSkip(s, story);
                        if (skip) {
                            log(`Skip ${s.id}: ${skip}`);
                            checkpoint.phases[s.id] = `⊘ ${skip}`;
                            saveCheckpoint(checkpoint, plan);
                            continue;
                        }
                        if (checkpoint.phases[s.id]?.startsWith('✓')) {
                            log(`${s.id}: done`);
                            continue;
                        }
                        activeSteps.push(s);
                    }

                    if (activeSteps.length > 0) {
                        const ok = await runParallelGroup(activeSteps, story, plan);
                        if (!ok) {
                            storyFailed = true;
                            break;
                        }
                    }

                    i = j; // Advance main loop past group
                    continue;
                }
            }

            const skip = shouldSkip(step, story);
            if (skip) {
                log(`Skip ${step.id}: ${skip}`);
                checkpoint.phases[step.id] = `⊘ ${skip}`;
                saveCheckpoint(checkpoint, plan);
                i++;
                continue;
            }

            if (checkpoint.phases[step.id]?.startsWith('✓')) {
                log(`${step.id}: done`);
                i++;
                continue;
            }

            if (!(await runStepAsync(step, story, plan))) {
                storyFailed = true;
                break;
            }
            i++;
        }

        // If story completed successfully (and not just one step run), mark as processed
        if (!storyFailed && !ONLY_STEP && !existsSync(resolve(__dirname, 'STOP'))) {
            if (!runnerState.processedStories.includes(story.story_id)) {
                runnerState.processedStories.push(story.story_id);
            }
            runnerState.currentStory = undefined;
            saveState(runnerState);
            logOk(`Story ${story.story_id} completed & saved to state`);
        }
    }


    console.log('');
    logOk('Done');
}

process.on('SIGINT', () => { log('\nInterrupted'); process.exit(130); });

main().catch(err => {
    console.error(err);
    process.exit(1);
});
