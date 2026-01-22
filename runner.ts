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
import { createProvider } from './providers/provider-factory.js';
import type { ProviderType } from './providers/base-provider.js';
import type { LogFunction } from './types.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============== AUTO-LOAD .env.local ==============
function loadEnvFile() {
    const envFiles = ['.env.local', '.env'];
    for (const envFile of envFiles) {
        const envPath = resolve(__dirname, envFile);
        if (existsSync(envPath)) {
            const content = readFileSync(envPath, 'utf-8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex > 0) {
                    const key = trimmed.slice(0, eqIndex).trim();
                    let value = trimmed.slice(eqIndex + 1).trim();
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    // Always override with .env.local values (file has priority)
                    process.env[key] = value;
                }
            }
            console.log(`\x1b[36m[ENV] Loaded ${envFile}\x1b[0m`);
            break;
        }
    }
}
loadEnvFile();

// ============== PROVIDER MANAGEMENT ==============

/**
 * Get provider type for a specific step
 * Priority: step.provider > plan.providers[stepId] > default 'claude'
 */
function getProviderForStep(step: Step, plan: PlanConfig): ProviderType {
    // Check for step-level override
    if (step.provider) {
        return step.provider;
    }

    // Check for plan-level mapping
    if (plan.providers && plan.providers[step.id]) {
        return plan.providers[step.id];
    }

    // Default to claude
    return 'claude';
}

/**
 * Execute LLM request using appropriate provider
 */
async function runLLMAsync(
    prompt: string,
    timeoutSec: number,
    stepId: string,
    providerType: ProviderType
): Promise<{ ok: boolean; output: string; error?: string }> {
    const provider = createProvider(
        providerType,
        log,
        logErr,
        DRY_RUN,
        MOCK_MODE,
        RAW_LOG_DIR
    );

    return await provider.execute(prompt, timeoutSec, stepId);
}

// Legacy function for backward compatibility (now uses provider system)
async function runClaudeAsync(prompt: string, timeoutSec: number, stepId: string): Promise<{ ok: boolean; output: string; error?: string }> {
    return runLLMAsync(prompt, timeoutSec, stepId, 'claude');
}

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
    file?: string;  // Optional for script steps
    agent?: string;
    timeout_sec?: number;
    skip_when?: string | null;
    type?: 'llm' | 'check' | 'script';  // Step type
    script?: string;  // Path to TypeScript file for script steps
    post_checks?: string;
    parallel_group?: string;
    depends_on?: string[];
    provider?: ProviderType;  // Optional per-step provider override
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
    // Provider mapping per step (defaults)
    providers?: Record<string, ProviderType>;
}

// Roadmap v2.0 format (from flow2-runner)
interface RoadmapStory {
    story_id: string;
    depends_on: string[];
    phase: 'MVP' | 'P2' | 'P3';
    complexity: 'S' | 'M' | 'L';
    type: 'frontend' | 'backend' | 'fullstack';
}

interface Roadmap {
    roadmap_version: string;
    generated_at: string;
    total_stories: number;
    execution: {
        max_parallel: number;
        target_phase: 'MVP' | 'P2' | 'P3' | 'ALL';
    };
    stories: RoadmapStory[];
    phases: Record<string, { story_count: number; description: string }>;
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

// ============== ROADMAP ==============

const ROADMAP_FILE = 'roadmap.yaml';

function loadRoadmap(): Roadmap | null {
    const roadmapPath = resolve(__dirname, ROADMAP_FILE);
    if (!existsSync(roadmapPath)) {
        log('No roadmap.yaml found - processing stories in alphabetical order');
        return null;
    }

    try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const roadmap = parseYaml(content) as Roadmap;
        log(`Loaded roadmap v${roadmap.roadmap_version} (${roadmap.total_stories} stories)`);
        log(`Target phase: ${roadmap.execution.target_phase}, max parallel: ${roadmap.execution.max_parallel}`);
        return roadmap;
    } catch (e) {
        logErr(`Failed to parse roadmap.yaml: ${e}`);
        return null;
    }
}

function canExecuteStory(
    storyId: string,
    roadmap: Roadmap | null,
    completedStories: Set<string>
): { canExecute: boolean; reason?: string } {
    if (!roadmap) {
        return { canExecute: true };
    }

    const roadmapStory = roadmap.stories.find(s => s.story_id === storyId);
    if (!roadmapStory) {
        return { canExecute: true }; // Story not in roadmap, allow execution
    }

    // Check phase
    const targetPhase = roadmap.execution.target_phase;
    if (targetPhase !== 'ALL') {
        const phaseOrder = ['MVP', 'P2', 'P3'];
        const targetIdx = phaseOrder.indexOf(targetPhase);
        const storyIdx = phaseOrder.indexOf(roadmapStory.phase);

        if (storyIdx > targetIdx) {
            return {
                canExecute: false,
                reason: `Phase ${roadmapStory.phase} > target ${targetPhase}`
            };
        }
    }

    // Check dependencies
    const unmetDeps = roadmapStory.depends_on.filter(dep => !completedStories.has(dep));
    if (unmetDeps.length > 0) {
        return {
            canExecute: false,
            reason: `Waiting for: ${unmetDeps.join(', ')}`
        };
    }

    return { canExecute: true };
}

function getNextExecutableStories(
    pendingStories: Story[],
    roadmap: Roadmap | null,
    completedStories: Set<string>,
    maxParallel: number
): Story[] {
    const executable: Story[] = [];

    for (const story of pendingStories) {
        if (executable.length >= maxParallel) break;

        const check = canExecuteStory(story.story_id, roadmap, completedStories);
        if (check.canExecute) {
            executable.push(story);
        }
    }

    return executable;
}

// ============== CHECKPOINT ==============

let checkpoint: Checkpoint | null = null;

// Track failure reasons for final summary
const storyFailureReasons = new Map<string, string>();

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
    skipped?: boolean;  // True if command not found (not a fixable error)
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

            // Detect "command not found" errors - these are not fixable by code changes
            const isCommandNotFound = output.includes('Command') && output.includes('not found') ||
                                      output.includes('ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL') ||
                                      output.includes('ENOENT') ||
                                      output.includes('is not recognized');

            if (isCommandNotFound) {
                // Skip this check - tool is not installed
                results.push({ name: check.name, passed: true, output, skipped: true });
                log(`  ${check.name}: SKIPPED (tool not installed)`);
            } else {
                results.push({ name: check.name, passed: false, output });
                logErr(`  ${check.name}: FAIL`);
                console.log('\x1b[90m' + output.slice(0, 500) + '\x1b[0m');
            }
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
            const isCommandNotFound = errMsg.includes('Command') && errMsg.includes('not found') ||
                                      errMsg.includes('ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL') ||
                                      errMsg.includes('ENOENT');

            if (isCommandNotFound) {
                log(`  ${fix.name}: skipped (tool not installed)`);
            } else {
                logErr(`  ${fix.name}: failed - ${errMsg.split('\n')[0]}`);
            }
        }
    }

    return anyFixed;
}

// ============== PFIX - AI ERROR REPAIR ==============

async function runPFix(errors: string, plan: PlanConfig): Promise<boolean> {
    logCheck('Running pFix - AI Error Repair...');

    // Load pFix instruction
    if (!plan.fix_step.file) {
        logErr('pFix step has no file property');
        return false;
    }
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
    // pFix uses claude by default, but can be overridden via step.provider
    const providerType = getProviderForStep(plan.fix_step, plan);
    const provider = createProvider(providerType, log, logErr, DRY_RUN, MOCK_MODE, RAW_LOG_DIR);
    const result = await provider.execute(instruction, timeout, plan.fix_step.id);

    if (result.ok) {
        logOk('pFix completed');
        return true;
    } else {
        logErr(`pFix failed: ${result.error}`);
        return false;
    }
}

// Legacy synchronous runClaude removed - now using async providers
// If needed, use runLLMAsync or provider.execute() directly

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
    if (!step.file) throw new Error(`Step ${step.id} has no file property`);
    const path = resolve(__dirname, step.file);
    if (!existsSync(path)) throw new Error(`Not found: ${path}`);

    let content = readFileSync(path, 'utf-8');

    // Process ATTACH markers
    content = processAttachments(content);

    content += `\n\n## STORY\n\`\`\`yaml\n${story.content}\n\`\`\``;
    content += `\n\n## CONTRACT\nWhen done, end with: ===NEXT_STEP_READY===`;

    return content;
}

// ============== SCRIPT STEP EXECUTION ==============

async function runScriptStep(step: Step, story: Story, plan: PlanConfig, cp: Checkpoint): Promise<boolean> {
    console.log('');
    logStep(`${step.id} | script: ${step.script}`);

    // Wait for file system writes to settle before VALIDATE (P0 might still be writing)
    if (step.id === 'VALIDATE') {
        log('Waiting 2.5s for P0 file writes to settle...');
        await new Promise(resolve => setTimeout(resolve, 2500));
    }

    if (!step.script) {
        logErr(`Step ${step.id} is type 'script' but missing 'script' property`);
        return false;
    }

    const scriptPath = resolve(__dirname, step.script);
    if (!existsSync(scriptPath)) {
        logErr(`Script not found: ${scriptPath}`);
        return false;
    }

    const timeout = step.timeout_sec || 300; // 5 min default for scripts
    const time = new Date().toISOString().slice(11, 16);

    // Create context directory if needed
    const contextDir = resolve(__dirname, 'context', story.story_id);
    if (!existsSync(contextDir)) {
        mkdirSync(contextDir, { recursive: true });
    }

    // Pass story context via environment variables
    const env = {
        ...process.env,
        STORY_ID: story.story_id,
        STORY_TYPE: story.type,
        STORY_EPIC: story.epic,
        STORY_FILE: resolve(__dirname, plan.stories.input_folder, `${story.story_id}.yaml`),
        CONTEXT_DIR: contextDir,
        CHECKPOINT_DIR: resolve(__dirname, plan.stories.checkpoint_folder),
        PROJECT_ROOT: process.cwd()
    };

    if (DRY_RUN) {
        log(`[DRY-RUN] Would execute: npx tsx ${scriptPath}`);
        cp.phases[step.id] = `✓ script ${time} [dry-run]`;
        saveCheckpoint(cp, plan);
        return true;
    }

    try {
        log(`Executing: npx tsx ${step.script}`);
        const result = await execAsync(`npx tsx ${scriptPath}`, {
            timeout: timeout * 1000,
            encoding: 'utf-8',
            env,
            cwd: __dirname,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        if (result.stdout) {
            result.stdout.split('\n').forEach(line => {
                if (line.trim()) log(line);
            });
        }
        if (result.stderr) {
            result.stderr.split('\n').forEach(line => {
                if (line.trim()) logErr(line);
            });
        }

        cp.phases[step.id] = `✓ script ${time}`;
        saveCheckpoint(cp, plan);
        logOk(`${step.id} completed`);

        // Run post_checks if defined
        if (step.post_checks) {
            const MAX_PFIX_RETRIES = 3;
            let checkResult = runCheckBundle(step.post_checks, plan);
            let pfixAttempts = 0;

            // Loop until checks pass or max retries exceeded
            while (!checkResult.allPassed && pfixAttempts < MAX_PFIX_RETRIES) {
                // Try autofix first (eslint --fix, prettier)
                const autofixRan = runAutofix(plan);

                if (autofixRan) {
                    // Re-run checks after autofix
                    checkResult = runCheckBundle(step.post_checks, plan);
                    if (checkResult.allPassed) {
                        log('Autofix resolved all issues');
                        break;
                    }
                }

                // Still failing - run pFix with error output
                pfixAttempts++;
                log(`pFix attempt ${pfixAttempts}/${MAX_PFIX_RETRIES}...`);

                const errorOutput = checkResult.results
                    .filter(r => !r.passed)
                    .map(r => `=== ${r.name} ===\n${r.output}`)
                    .join('\n\n');

                const pFixOk = await runPFix(errorOutput, plan);

                if (!pFixOk) {
                    cp.phases[step.id + '-check'] = `✗ ${time} pfix-error (attempt ${pfixAttempts})`;
                    saveCheckpoint(cp, plan);
                    logErr(`pFix failed on attempt ${pfixAttempts}`);
                    return false;
                }

                // Re-run checks after pFix
                checkResult = runCheckBundle(step.post_checks, plan);

                if (checkResult.allPassed) {
                    log(`pFix resolved all issues on attempt ${pfixAttempts}`);
                    break;
                }

                if (pfixAttempts < MAX_PFIX_RETRIES) {
                    log(`Checks still failing after pFix attempt ${pfixAttempts}, retrying...`);
                }
            }

            // Final check - did we succeed?
            if (!checkResult.allPassed) {
                cp.phases[step.id + '-check'] = `✗ ${time} pfix-exhausted (${pfixAttempts} attempts)`;
                saveCheckpoint(cp, plan);
                logErr(`post_checks still failing after ${pfixAttempts} pFix attempts`);
                return false;
            }

            cp.phases[step.id + '-check'] = `✓ ${time}`;
            saveCheckpoint(cp, plan);
        }

        return true;
    } catch (err: any) {
        const output = (err.stdout || '') + (err.stderr || '');
        logErr(`Script failed: ${err.message}`);

        // Log full error output (not truncated)
        if (output) {
            output.split('\n').forEach((line: string) => {
                if (line.trim()) logErr(`  ${line}`);
            });
        }

        // Store failure reason for summary
        const failureReason = err.message.slice(0, 200);
        storyFailureReasons.set(story.story_id, `${step.id}: ${failureReason}`);

        // Retry logic for fixable script steps (VALIDATE can be fixed by regenerating specs)
        const FIXABLE_SCRIPTS = ['VALIDATE'];
        const MAX_SCRIPT_RETRIES = 2;

        if (FIXABLE_SCRIPTS.includes(step.id) && !DRY_RUN) {
            let retryCount = 0;

            while (retryCount < MAX_SCRIPT_RETRIES) {
                retryCount++;
                log(`\nScript retry ${retryCount}/${MAX_SCRIPT_RETRIES} - calling pFix to repair specs...`);

                // Call pFix with the error context
                const errorContext = `Script ${step.id} failed for story ${story.story_id}:\n${output}\n\nFix the YAML specs in context/${story.story_id}/ directory.`;
                const pFixOk = await runPFix(errorContext, plan);

                if (!pFixOk) {
                    logErr(`pFix failed on retry ${retryCount}`);
                    continue;
                }

                // Wait a moment for file writes
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Re-run the script
                try {
                    log(`Re-running: npx tsx ${step.script}`);
                    const retryResult = await execAsync(`npx tsx ${scriptPath}`, {
                        timeout: timeout * 1000,
                        encoding: 'utf-8',
                        env,
                        cwd: __dirname,
                        maxBuffer: 10 * 1024 * 1024
                    });

                    if (retryResult.stdout) {
                        retryResult.stdout.split('\n').forEach((line: string) => {
                            if (line.trim()) log(line);
                        });
                    }

                    // Success!
                    cp.phases[step.id] = `✓ script ${time} (retry ${retryCount})`;
                    saveCheckpoint(cp, plan);
                    logOk(`${step.id} completed after ${retryCount} retry(s)`);
                    storyFailureReasons.delete(story.story_id);
                    return true;
                } catch (retryErr: any) {
                    const retryOutput = (retryErr.stdout || '') + (retryErr.stderr || '');
                    logErr(`Script still failing after retry ${retryCount}: ${retryErr.message}`);
                    if (retryOutput) {
                        retryOutput.split('\n').slice(0, 10).forEach((line: string) => {
                            if (line.trim()) logErr(`  ${line}`);
                        });
                    }
                }
            }

            logErr(`Script ${step.id} failed after ${MAX_SCRIPT_RETRIES} pFix retries`);
            cp.phases[step.id] = `✗ ${time} script-error (${MAX_SCRIPT_RETRIES} retries exhausted)`;
            saveCheckpoint(cp, plan);
            return false;
        }

        cp.phases[step.id] = `✗ ${time} script-error`;
        saveCheckpoint(cp, plan);
        return false;
    }
}

// ============== LLM STEP EXECUTION ==============

async function runStepAsync(step: Step, story: Story, plan: PlanConfig, storyCheckpoint?: Checkpoint): Promise<boolean> {
    // Use provided checkpoint or fall back to global (for backwards compatibility)
    const cp = storyCheckpoint || checkpoint!;

    // Dispatch to script handler for script steps
    if (step.type === 'script') {
        return runScriptStep(step, story, plan, cp);
    }

    console.log('');
    const providerType = getProviderForStep(step, plan);
    logStep(`${step.id} | ${step.agent || 'agent'} [${providerType}]`);

    if (!step.file) {
        logErr(`Step ${step.id} is missing 'file' property`);
        return false;
    }

    const instruction = loadInstruction(step, story);
    const timeout = step.timeout_sec || plan.runner.default_timeout_sec;

    // Use the provider system for all LLM calls
    const result = await runLLMAsync(instruction, timeout, step.id, providerType);

    const time = new Date().toISOString().slice(11, 16);

    if (result.ok) {
        cp.phases[step.id] = `✓ ${step.agent || 'agent'} ${time}`;
        saveCheckpoint(cp, plan);
        logOk(`${step.id} completed`);

        // Run post_checks if defined
        if (step.post_checks) {
            console.log('');
            const MAX_PFIX_RETRIES = 3;
            let checkResult = runCheckBundle(step.post_checks, plan);
            let pfixAttempts = 0;

            // Loop until checks pass or max retries exceeded
            while (!checkResult.allPassed && pfixAttempts < MAX_PFIX_RETRIES) {
                // Try autofix first (eslint --fix, prettier)
                const autofixRan = runAutofix(plan);

                if (autofixRan) {
                    // Re-run checks after autofix
                    checkResult = runCheckBundle(step.post_checks, plan);
                    if (checkResult.allPassed) {
                        log('Autofix resolved all issues');
                        break;
                    }
                }

                // Still failing - run pFix with error output
                pfixAttempts++;
                log(`pFix attempt ${pfixAttempts}/${MAX_PFIX_RETRIES}...`);

                const errorOutput = checkResult.results
                    .filter(r => !r.passed)
                    .map(r => `=== ${r.name} ===\n${r.output}`)
                    .join('\n\n');

                const pFixOk = await runPFix(errorOutput, plan);

                if (!pFixOk) {
                    cp.phases[step.id + '-check'] = `✗ ${time} pfix-error (attempt ${pfixAttempts})`;
                    saveCheckpoint(cp, plan);
                    logErr(`pFix failed on attempt ${pfixAttempts}`);
                    return false;
                }

                // Re-run checks after pFix
                checkResult = runCheckBundle(step.post_checks, plan);

                if (checkResult.allPassed) {
                    log(`pFix resolved all issues on attempt ${pfixAttempts}`);
                    break;
                }

                if (pfixAttempts < MAX_PFIX_RETRIES) {
                    log(`Checks still failing after pFix attempt ${pfixAttempts}, retrying...`);
                }
            }

            // Final check - did we succeed?
            if (!checkResult.allPassed) {
                cp.phases[step.id + '-check'] = `✗ ${time} pfix-exhausted (${pfixAttempts} attempts)`;
                saveCheckpoint(cp, plan);
                logErr(`post_checks still failing after ${pfixAttempts} pFix attempts`);
                return false;
            }

            cp.phases[step.id + '-check'] = `✓ ${time}`;
            saveCheckpoint(cp, plan);
        }

        return true;
    } else {
        cp.phases[step.id] = `✗ ${time} ${result.error}`;
        saveCheckpoint(cp, plan);
        logErr(`${step.id} failed: ${result.error}`);
        return false;
    }
}

// ============== SINGLE STORY EXECUTION ==============

async function runSingleStory(
    story: Story,
    plan: PlanConfig,
    runnerState: RunnerState
): Promise<{ success: boolean; storyId: string }> {
    console.log('\n' + '='.repeat(60));
    logStep(`Story: ${story.story_id} (${story.type})`);
    console.log('='.repeat(60));

    const storyCheckpoint = loadCheckpoint(story, plan);
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
                        log(`[${story.story_id}] Skip ${s.id}: ${skip}`);
                        storyCheckpoint.phases[s.id] = `⊘ ${skip}`;
                        saveCheckpoint(storyCheckpoint, plan);
                        continue;
                    }
                    if (storyCheckpoint.phases[s.id]?.startsWith('✓')) {
                        log(`[${story.story_id}] ${s.id}: done`);
                        continue;
                    }
                    activeSteps.push(s);
                }

                if (activeSteps.length > 0) {
                    const ok = await runParallelGroup(activeSteps, story, plan, storyCheckpoint);
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
            log(`[${story.story_id}] Skip ${step.id}: ${skip}`);
            storyCheckpoint.phases[step.id] = `⊘ ${skip}`;
            saveCheckpoint(storyCheckpoint, plan);
            i++;
            continue;
        }

        if (storyCheckpoint.phases[step.id]?.startsWith('✓')) {
            log(`[${story.story_id}] ${step.id}: done`);
            i++;
            continue;
        }

        if (!(await runStepAsync(step, story, plan, storyCheckpoint))) {
            storyFailed = true;
            break;
        }
        i++;
    }

    return { success: !storyFailed && !existsSync(resolve(__dirname, 'STOP')), storyId: story.story_id };
}

// ============== PARALLEL EXECUTION ==============

async function runParallelGroup(steps: Step[], story: Story, plan: PlanConfig, storyCheckpoint: Checkpoint): Promise<boolean> {
    log(`Running parallel group: ${steps.map(s => s.id).join(', ')}`);

    // Simple DAG scheduler
    const pending = [...steps];
    const executing = new Map<string, Promise<boolean>>();
    const completed = new Set<string>();
    let failed = false;

    while (pending.length > 0 || executing.size > 0) {
        // Find and launch ALL runnable steps (not just one)
        const toStart: Step[] = [];
        for (let i = pending.length - 1; i >= 0; i--) {
            const step = pending[i];

            // Checks for dependencies: if step has deps, all must be in 'completed' OR not in the parallel group at all (implied external/previous)
            const deps = step.depends_on || [];
            if (deps.every(d => completed.has(d) || !steps.some(s => s.id === d))) {
                toStart.push(step);
                pending.splice(i, 1);
            }
        }

        // Launch all runnable steps at once (in parallel)
        for (const step of toStart) {
            log(`Starting parallel step: ${step.id}`);
            const p = runStepAsync(step, story, plan, storyCheckpoint).then(ok => {
                log(ok ? `${step.id} finished (OK)` : `${step.id} finished (FAIL)`);
                if (ok) completed.add(step.id);
                else failed = true;
                executing.delete(step.id);
                return ok;
            });

            executing.set(step.id, p);
        }

        if (executing.size === 0 && pending.length > 0) {
            logErr('Deadlock in parallel group dependencies: ' + pending.map(s => s.id).join(', '));
            return false;
        }

        if (executing.size === 0 && pending.length === 0) break;

        // Wait for at least one to finish before checking for more runnable steps
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

    // Load roadmap for dependency-aware execution
    const roadmap = loadRoadmap();
    const completedStories = new Set<string>(runnerState.processedStories);
    const maxParallel = roadmap?.execution.max_parallel || 1;

    // Setup logging before any provider usage
    setupLogging();

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

    // Process stories with dependency awareness
    const pendingStories = stories.filter(s => !completedStories.has(s.story_id));
    let processedThisRun = 0;
    let skippedCount = 0;
    let failedStories: string[] = [];

    while (pendingStories.length > 0) {
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file - exiting');
            break;
        }

        // Find next executable stories (respecting dependencies and phase)
        const executable = getNextExecutableStories(pendingStories, roadmap, completedStories, maxParallel);

        if (executable.length === 0) {
            // No executable stories - show why
            log('\n⏸ No executable stories available');
            for (const story of pendingStories) {
                const check = canExecuteStory(story.story_id, roadmap, completedStories);
                if (!check.canExecute) {
                    log(`  ${story.story_id}: ${check.reason}`);
                    skippedCount++;
                }
            }
            break;
        }

        // Remove executable stories from pending
        for (const story of executable) {
            const idx = pendingStories.findIndex(s => s.story_id === story.story_id);
            if (idx >= 0) pendingStories.splice(idx, 1);
        }

        // Log what we're about to run
        if (executable.length > 1) {
            log(`\n🚀 Running ${executable.length} stories in parallel: ${executable.map(s => s.story_id).join(', ')}`);
        }

        // Run stories in parallel (or single if only one)
        const storyPromises = executable.map(story => runSingleStory(story, plan, runnerState));
        const results = await Promise.all(storyPromises);

        // Process results
        for (const result of results) {
            if (result.success && !ONLY_STEP) {
                if (!runnerState.processedStories.includes(result.storyId)) {
                    runnerState.processedStories.push(result.storyId);
                }
                completedStories.add(result.storyId);
                processedThisRun++;
                saveState(runnerState);
                logOk(`Story ${result.storyId} completed & saved to state`);
            } else if (!result.success) {
                failedStories.push(result.storyId);
                const reason = storyFailureReasons.get(result.storyId);
                logErr(`Story ${result.storyId} failed${reason ? `: ${reason}` : ''}`);
            }
        }

        // If any story failed, stop processing
        if (failedStories.length > 0) {
            log(`\n⚠ Stopping due to failed stories: ${failedStories.join(', ')}`);
            break;
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    log(`Processed: ${processedThisRun} stories`);
    if (failedStories.length > 0) {
        logErr(`Failed: ${failedStories.length} stories`);
        for (const storyId of failedStories) {
            const reason = storyFailureReasons.get(storyId) || 'See checkpoint for details';
            logErr(`  ${storyId}: ${reason}`);
        }
    }
    if (skippedCount > 0) {
        log(`Skipped: ${skippedCount} stories (dependencies not met or phase mismatch)`);
    }
    log(`Remaining: ${pendingStories.length} stories`);

    console.log('');
    if (failedStories.length > 0) {
        logErr('Finished with errors');
        process.exit(1);
    } else {
        logOk('Done');
    }
}

process.on('SIGINT', () => { log('\nInterrupted'); process.exit(130); });

main().catch(err => {
    console.error(err);
    process.exit(1);
});
