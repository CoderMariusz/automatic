/**
 * Claude Workflow Runner - Story Delivery
 * 
 * Uruchamia Claude Code CLI z flagą -p dla każdego kroku.
 * Async spawn z live output monitoring.
 */

import { spawn, ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============== TYPES ==============

interface Step {
    id: string;
    file: string;
    agent?: string;
    timeout_sec?: number;
    skip_when?: string | null;
    on_fail?: string;
    type?: string;
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
    steps: Step[];
}

// ============== GLOBALS ==============

let currentCheckpoint: Checkpoint | null = null;
let currentProcess: ChildProcess | null = null;

// ============== HELPERS ==============

function loadPlan(): PlanConfig {
    const planPath = resolve(__dirname, 'plan.yaml');
    return parseYaml(readFileSync(planPath, 'utf-8')) as PlanConfig;
}

function log(msg: string) {
    console.log(`\x1b[36m[${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`);
}

function logStep(msg: string) {
    console.log(`\x1b[33m>>> ${msg}\x1b[0m`);
}

function logSuccess(msg: string) {
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function logError(msg: string) {
    console.log(`\x1b[31m✗ ${msg}\x1b[0m`);
}

// ============== STORY MANAGEMENT ==============

function loadPendingStories(plan: PlanConfig): Story[] {
    const pendingPath = resolve(__dirname, plan.stories.input_folder);
    if (!existsSync(pendingPath)) {
        mkdirSync(pendingPath, { recursive: true });
        return [];
    }

    return readdirSync(pendingPath)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.md'))
        .map(file => {
            const content = readFileSync(resolve(pendingPath, file), 'utf-8');
            const storyId = basename(file).replace(/\.(yaml|md)$/, '');
            let parsed: any = {};
            try { parsed = parseYaml(content); } catch { }

            return {
                story_id: parsed.story_id || storyId,
                epic: parsed.epic || 'unknown',
                type: parsed.type || 'fullstack',
                content
            };
        });
}

function moveToProcessed(story: Story, plan: PlanConfig) {
    const from = resolve(__dirname, plan.stories.input_folder);
    const to = resolve(__dirname, plan.stories.processed_folder);
    if (!existsSync(to)) mkdirSync(to, { recursive: true });

    readdirSync(from)
        .filter(f => f.includes(story.story_id))
        .forEach(f => renameSync(resolve(from, f), resolve(to, f)));

    logSuccess(`Story ${story.story_id} moved to processed`);
}

// ============== CHECKPOINT ==============

function loadOrCreateCheckpoint(story: Story, plan: PlanConfig): Checkpoint {
    const dir = resolve(__dirname, plan.stories.checkpoint_folder);
    const path = resolve(dir, `${story.story_id}.yaml`);

    if (existsSync(path)) {
        return parseYaml(readFileSync(path, 'utf-8')) as Checkpoint;
    }

    const cp: Checkpoint = {
        story_id: story.story_id,
        epic: story.epic,
        type: story.type,
        status: 'in_progress',
        phases: { P1: null, P2: null, P3a: null, P3b: null, P3c: null, P3d: null, P4: null, P5: null, P6: null, P7: null }
    };

    saveCheckpoint(cp, plan);
    return cp;
}

function saveCheckpoint(cp: Checkpoint, plan: PlanConfig) {
    const dir = resolve(__dirname, plan.stories.checkpoint_folder);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${cp.story_id}.yaml`), stringifyYaml(cp));
}

function updateCheckpoint(stepId: string, status: string, cp: Checkpoint, plan: PlanConfig) {
    cp.phases[stepId] = status;
    saveCheckpoint(cp, plan);
}

// ============== SKIP LOGIC ==============

function shouldSkip(step: Step, story: Story): string | null {
    if (!step.skip_when) return null;
    if (step.skip_when === 'backend-only' && story.type === 'backend') return 'backend-only';
    if (step.skip_when === 'frontend-only' && story.type === 'frontend') return 'frontend-only';
    return null;
}

// ============== CLAUDE EXECUTION (ASYNC) ==============

interface ClaudeResult {
    success: boolean;
    output: string;
    error?: string;
}

function runClaudeAsync(prompt: string, timeoutSec: number): Promise<ClaudeResult> {
    return new Promise((resolve) => {
        logStep(`Executing Claude (timeout: ${timeoutSec}s)...`);
        console.log('\x1b[90m--- Claude output start ---\x1b[0m');

        const proc = spawn('claude', [
            '-p', prompt,
            '--dangerously-skip-permissions'
        ], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        currentProcess = proc;

        let output = '';
        let stderr = '';
        let resolved = false;

        // Timeout handler
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                proc.kill('SIGTERM');
                console.log('\x1b[90m--- Claude output end (timeout) ---\x1b[0m');
                resolve({ success: false, output, error: `Timeout after ${timeoutSec}s` });
            }
        }, timeoutSec * 1000);

        // Live stdout streaming
        proc.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;
            process.stdout.write(text); // Real-time output!
        });

        // Capture stderr
        proc.stderr?.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            // Filter out deprecation warnings
            if (!text.includes('DeprecationWarning')) {
                process.stderr.write(`\x1b[31m${text}\x1b[0m`);
            }
        });

        // Process exit
        proc.on('close', (code) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            currentProcess = null;

            console.log('\x1b[90m--- Claude output end ---\x1b[0m');

            // Success if exit code 0 or we got substantial output
            if (code === 0 || output.length > 100) {
                resolve({ success: true, output });
            } else {
                resolve({
                    success: false,
                    output,
                    error: stderr || `Exit code: ${code}`
                });
            }
        });

        proc.on('error', (err) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            currentProcess = null;
            console.log('\x1b[90m--- Claude output end (error) ---\x1b[0m');
            resolve({ success: false, output: '', error: err.message });
        });
    });
}

// ============== PING TEST ==============

async function pingTest(): Promise<boolean> {
    log('Step 0: Testing Claude Code CLI...');

    const result = await runClaudeAsync('Say exactly one word: OK', 60);

    if (result.output && result.output.length > 0) {
        logSuccess('Claude Code responding');
        return true;
    }

    logError(`Claude not responding: ${result.error || 'No output'}`);
    return false;
}

// ============== INSTRUCTION LOADING ==============

function loadInstruction(file: string, story: Story, stepId: string): string {
    const path = resolve(__dirname, file);
    if (!existsSync(path)) throw new Error(`Not found: ${path}`);

    let content = readFileSync(path, 'utf-8');

    // Add story context
    content += `\n\n## STORY\n\`\`\`yaml\n${story.content}\n\`\`\`\n`;

    // Add contract
    content += `\n## CONTRACT\nWhen finished, end with exactly:\n===NEXT_STEP_READY===`;

    return content;
}

// ============== STEP EXECUTION ==============

async function runStep(step: Step, story: Story, plan: PlanConfig): Promise<boolean> {
    console.log('');
    log(`${'='.repeat(50)}`);
    logStep(`Step: ${step.id} | Agent: ${step.agent || 'default'}`);
    log(`${'='.repeat(50)}`);
    console.log('');

    const instruction = loadInstruction(step.file, story, step.id);
    const timeout = step.timeout_sec || plan.runner.default_timeout_sec;

    const result = await runClaudeAsync(instruction, timeout);

    const time = new Date().toISOString().slice(11, 16);

    if (result.success) {
        updateCheckpoint(step.id, `✓ ${step.agent || 'agent'} ${time}`, currentCheckpoint!, plan);
        logSuccess(`Step ${step.id}: COMPLETED`);
        return true;
    } else {
        updateCheckpoint(step.id, `✗ ${step.agent || 'agent'} ${time} error:${result.error}`, currentCheckpoint!, plan);
        logError(`Step ${step.id}: FAILED - ${result.error}`);
        return false;
    }
}

// ============== MAIN ==============

async function processStory(story: Story, plan: PlanConfig) {
    console.log('');
    log(`${'#'.repeat(60)}`);
    logStep(`Story: ${story.story_id} (${story.type})`);
    log(`${'#'.repeat(60)}`);
    console.log('');

    currentCheckpoint = loadOrCreateCheckpoint(story, plan);

    for (const step of plan.steps) {
        // STOP file check
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file detected - stopping');
            break;
        }

        // Skip check-only steps
        if (step.type === 'check') continue;

        // Skip conditions
        const skipReason = shouldSkip(step, story);
        if (skipReason) {
            log(`Skipping ${step.id}: ${skipReason}`);
            updateCheckpoint(step.id, `⊘ ${skipReason}`, currentCheckpoint, plan);
            continue;
        }

        // Already completed?
        if (currentCheckpoint.phases[step.id]?.startsWith('✓')) {
            log(`${step.id}: already completed, skipping`);
            continue;
        }

        // Execute step
        const success = await runStep(step, story, plan);
        if (!success) {
            log('Stopping due to failure');
            break;
        }
    }
}

async function main() {
    console.log('');
    console.log('\x1b[1m╔══════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1m║     Claude Workflow Runner - Story Delivery          ║\x1b[0m');
    console.log('\x1b[1m╚══════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');

    const plan = loadPlan();
    log(`Loaded ${plan.steps.length} steps from plan.yaml`);

    const stories = loadPendingStories(plan);
    log(`Found ${stories.length} pending stories`);

    if (stories.length === 0) {
        log('No stories in stories/pending/');
        process.exit(0);
    }

    // Ping test
    if (!await pingTest()) {
        logError('Claude Code not responding. Try running:');
        console.log('  claude -p "test" --dangerously-skip-permissions');
        process.exit(1);
    }

    // Process each story
    for (const story of stories) {
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file detected - exiting');
            break;
        }

        await processStory(story, plan);
    }

    console.log('');
    logSuccess('Runner finished');
    process.exit(0);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('');
    log('Interrupted (Ctrl+C)');
    if (currentProcess) {
        currentProcess.kill('SIGTERM');
    }
    process.exit(130);
});

main().catch(err => {
    logError(`Fatal: ${err.message}`);
    process.exit(1);
});
