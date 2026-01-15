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

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
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
const SHOW_HELP = args.includes('--help') || args.includes('-h');

if (SHOW_HELP) {
    console.log(`
Claude Workflow Runner - Story Delivery

Usage: npm start -- [flags]

Flags:
  --dry-run       Tylko loguj, nie wykonuj Claude
  --skip-checks   Pomiń check bundles
  --step=P3a      Uruchom tylko konkretny step
  --check=quick   Uruchom bundle 'quick' (tsc)
  --check=full    Uruchom bundle 'full' (tsc + eslint + build)
  --check-all     Uruchom wszystkie bundles
  --autofix       Uruchom autofix (eslint --fix, prettier)
  --setup         Sprawdź i zainstaluj brakujące dependencies
  --help, -h      Pokaż tę pomoc

Examples:
  npm start                      # Uruchom workflow
  npm start -- --dry-run         # Test bez Claude
  npm start -- --check=quick     # Tylko tsc
  npm start -- --setup           # Zainstaluj dependencies
`);
    process.exit(0);
}

if (DRY_RUN) console.log('\x1b[33m[DRY-RUN MODE]\x1b[0m');
if (SKIP_CHECKS) console.log('\x1b[33m[SKIP-CHECKS MODE]\x1b[0m');
if (ONLY_STEP) console.log(`\x1b[33m[ONLY STEP: ${ONLY_STEP}]\x1b[0m`);
if (CHECK_BUNDLE) console.log(`\x1b[33m[CHECK MODE: ${CHECK_BUNDLE}]\x1b[0m`);
if (CHECK_ALL) console.log('\x1b[33m[CHECK-ALL MODE]\x1b[0m');
if (RUN_AUTOFIX) console.log('\x1b[33m[AUTOFIX MODE]\x1b[0m');
if (RUN_SETUP) console.log('\x1b[33m[SETUP MODE]\x1b[0m');

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

// ============== HELPERS ==============

function loadPlan(): PlanConfig {
    return parseYaml(readFileSync(resolve(__dirname, 'plan.yaml'), 'utf-8')) as PlanConfig;
}

const log = (msg: string) => console.log(`\x1b[36m[${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`);
const logStep = (msg: string) => console.log(`\x1b[33m>>> ${msg}\x1b[0m`);
const logOk = (msg: string) => console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
const logErr = (msg: string) => console.log(`\x1b[31m✗ ${msg}\x1b[0m`);
const logCheck = (msg: string) => console.log(`\x1b[35m[CHECK] ${msg}\x1b[0m`);

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

    const promptFile = resolve(__dirname, '.prompt.tmp');
    writeFileSync(promptFile, prompt);

    log(`Executing Claude (timeout: ${timeoutSec}s)...`);
    console.log('\x1b[90m--- output start ---\x1b[0m');

    try {
        const isWindows = process.platform === 'win32';
        const catCmd = isWindows ? 'type' : 'cat';
        const cmd = `${catCmd} "${promptFile}" | claude -p - --dangerously-skip-permissions`;

        const output = execSync(cmd, {
            timeout: timeoutSec * 1000,
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        console.log(output);
        console.log('\x1b[90m--- output end ---\x1b[0m');
        return { ok: true, output };

    } catch (err: any) {
        const output = err.stdout || '';
        if (output) console.log(output);
        console.log('\x1b[90m--- output end ---\x1b[0m');

        if (output.length > 50) return { ok: true, output };
        return { ok: false, output, error: err.message };
    }
}

// ============== STEPS ==============

function shouldSkip(step: Step, story: Story): string | null {
    if (!step.skip_when) return null;
    if (step.skip_when === 'backend-only' && story.type === 'backend') return 'backend-only';
    if (step.skip_when === 'frontend-only' && story.type === 'frontend') return 'frontend-only';
    return null;
}

function loadInstruction(step: Step, story: Story): string {
    const path = resolve(__dirname, step.file);
    if (!existsSync(path)) throw new Error(`Not found: ${path}`);

    let content = readFileSync(path, 'utf-8');
    content += `\n\n## STORY\n\`\`\`yaml\n${story.content}\n\`\`\``;
    content += `\n\n## CONTRACT\nWhen done, end with: ===NEXT_STEP_READY===`;

    return content;
}

function runStep(step: Step, story: Story, plan: PlanConfig): boolean {
    console.log('');
    logStep(`${step.id} | ${step.agent || 'agent'}`);

    const instruction = loadInstruction(step, story);
    const timeout = step.timeout_sec || plan.runner.default_timeout_sec;
    const result = runClaude(instruction, timeout);

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

// ============== MAIN ==============

function main() {
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

    const stories = loadStories(plan);
    log(`Found ${stories.length} pending stories`);

    if (!stories.length) {
        log('No stories in stories/pending/');
        return;
    }

    // Ping test (skip in dry-run)
    if (!DRY_RUN) {
        log('Testing Claude CLI...');
        const ping = runClaude('Say: OK', 120);
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

        console.log('\n' + '='.repeat(60));
        logStep(`Story: ${story.story_id} (${story.type})`);
        console.log('='.repeat(60));

        checkpoint = loadCheckpoint(story, plan);

        for (const step of plan.steps) {
            if (existsSync(resolve(__dirname, 'STOP'))) break;

            // Skip check-only steps (handled by post_checks)
            if (step.type === 'check') continue;

            // If --step flag, only run that step
            if (ONLY_STEP && step.id !== ONLY_STEP) continue;

            const skip = shouldSkip(step, story);
            if (skip) {
                log(`Skip ${step.id}: ${skip}`);
                checkpoint.phases[step.id] = `⊘ ${skip}`;
                saveCheckpoint(checkpoint, plan);
                continue;
            }

            if (checkpoint.phases[step.id]?.startsWith('✓')) {
                log(`${step.id}: done`);
                continue;
            }

            if (!runStep(step, story, plan)) break;
        }
    }

    console.log('');
    logOk('Done');
}

process.on('SIGINT', () => { log('\nInterrupted'); process.exit(130); });

main();
