/**
 * Claude Workflow Runner - Story Delivery
 * 
 * Uruchamia Claude Code CLI z flagą -p dla każdego kroku.
 * Używa --output-format text dla prostszego parsowania.
 */

import { execSync, spawnSync } from 'child_process';
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

interface Handoff {
    from: string;
    status: string;
    summary: string;
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

// ============== HELPERS ==============

function loadPlan(): PlanConfig {
    const planPath = resolve(__dirname, 'plan.yaml');
    return parseYaml(readFileSync(planPath, 'utf-8')) as PlanConfig;
}

function log(msg: string) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
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

    log(`Story ${story.story_id} moved to processed`);
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

// ============== CLAUDE EXECUTION ==============

interface ClaudeResult {
    success: boolean;
    output: string;
    error?: string;
}

function runClaude(prompt: string, timeoutSec: number): ClaudeResult {
    // Zapisz prompt do pliku tymczasowego (unika problemów z escaping)
    const promptFile = resolve(__dirname, '.temp_prompt.txt');
    writeFileSync(promptFile, prompt);

    try {
        // Użyj spawnSync z stdio inherit dla lepszego output
        const result = spawnSync('claude', [
            '-p', prompt,
            '--dangerously-skip-permissions',
            '--output-format', 'text'
        ], {
            timeout: timeoutSec * 1000,
            encoding: 'utf-8',
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });

        const output = result.stdout || '';
        const stderr = result.stderr || '';

        // Print output in real-time simulation
        if (output) console.log(output);
        if (stderr && !stderr.includes('DeprecationWarning')) console.error(stderr);

        if (result.error) {
            return { success: false, output: '', error: result.error.message };
        }

        if (result.status !== 0 && result.status !== null) {
            return { success: false, output, error: `Exit code: ${result.status}` };
        }

        return { success: true, output };
    } catch (err: any) {
        return { success: false, output: '', error: err.message };
    }
}

// Alternatywna wersja z execSync
function runClaudeExec(prompt: string, timeoutSec: number): ClaudeResult {
    // Escape dla shell
    const escaped = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
    const cmd = `claude -p "${escaped}" --dangerously-skip-permissions`;

    try {
        const output = execSync(cmd, {
            timeout: timeoutSec * 1000,
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        console.log(output);
        return { success: true, output };
    } catch (err: any) {
        const output = err.stdout || '';
        const stderr = err.stderr || '';
        console.log(output);
        if (stderr) console.error(stderr);

        // Jeśli mamy output, uznaj za sukces (Claude może wyjść z kodem != 0)
        if (output && output.length > 50) {
            return { success: true, output };
        }

        return { success: false, output, error: err.message };
    }
}

// ============== PING TEST ==============

function pingTest(): boolean {
    log('Step 0: Testing Claude Code CLI...');

    const result = runClaudeExec('Say exactly: CLAUDE_OK', 60);

    if (result.output && result.output.length > 5) {
        log('Step 0: OK - Claude Code responding');
        return true;
    }

    log(`Step 0: FAILED - ${result.error || 'No output'}`);
    return false;
}

// ============== INSTRUCTION LOADING ==============

function loadInstruction(file: string, story: Story, stepId: string): string {
    const path = resolve(__dirname, file);
    if (!existsSync(path)) throw new Error(`Not found: ${path}`);

    let content = readFileSync(path, 'utf-8');

    // Dodaj kontekst story
    content += `\n\n## STORY\n${story.content}\n`;

    // Dodaj kontrakt
    content += `\n## CONTRACT\nEnd your response with:\n===NEXT_STEP_READY===`;

    return content;
}

// ============== STEP EXECUTION ==============

function runStep(step: Step, story: Story, plan: PlanConfig): boolean {
    log(`\n${'='.repeat(50)}`);
    log(`Step: ${step.id} | Agent: ${step.agent || 'default'}`);
    log(`${'='.repeat(50)}\n`);

    const instruction = loadInstruction(step.file, story, step.id);
    const timeout = step.timeout_sec || plan.runner.default_timeout_sec;

    log(`Executing Claude (timeout: ${timeout}s)...`);
    const result = runClaudeExec(instruction, timeout);

    const time = new Date().toISOString().slice(11, 16);

    if (result.success) {
        updateCheckpoint(step.id, `✓ ${step.agent || 'agent'} ${time}`, currentCheckpoint!, plan);
        log(`Step ${step.id}: COMPLETED ✓`);
        return true;
    } else {
        updateCheckpoint(step.id, `✗ ${step.agent || 'agent'} ${time} error:${result.error}`, currentCheckpoint!, plan);
        log(`Step ${step.id}: FAILED - ${result.error}`);
        return false;
    }
}

// ============== MAIN ==============

async function processStory(story: Story, plan: PlanConfig) {
    log(`\n${'#'.repeat(60)}`);
    log(`Story: ${story.story_id} (${story.type})`);
    log(`${'#'.repeat(60)}\n`);

    currentCheckpoint = loadOrCreateCheckpoint(story, plan);

    for (const step of plan.steps) {
        // STOP file
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file - stopping');
            break;
        }

        // Skip check-only
        if (step.type === 'check') continue;

        // Skip conditions
        const skipReason = shouldSkip(step, story);
        if (skipReason) {
            log(`Skip ${step.id}: ${skipReason}`);
            updateCheckpoint(step.id, `⊘ ${skipReason}`, currentCheckpoint, plan);
            continue;
        }

        // Already done?
        if (currentCheckpoint.phases[step.id]?.startsWith('✓')) {
            log(`${step.id}: already done`);
            continue;
        }

        // Execute
        const ok = runStep(step, story, plan);
        if (!ok) break;
    }
}

function main() {
    log('Claude Workflow Runner - Story Delivery');
    log('========================================\n');

    const plan = loadPlan();
    log(`Steps: ${plan.steps.length}`);

    const stories = loadPendingStories(plan);
    log(`Pending stories: ${stories.length}`);

    if (stories.length === 0) {
        log('No stories in stories/pending/');
        process.exit(0);
    }

    // Ping
    if (!pingTest()) {
        log('FATAL: Claude Code not responding');
        log('Try running: claude -p "test" --dangerously-skip-permissions');
        process.exit(1);
    }

    // Process
    for (const story of stories) {
        if (existsSync(resolve(__dirname, 'STOP'))) break;
        processStory(story, plan);
    }

    log('\nDone.');
}

process.on('SIGINT', () => {
    log('\nInterrupted');
    process.exit(130);
});

main();
