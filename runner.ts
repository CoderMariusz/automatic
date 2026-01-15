/**
 * Claude Workflow Runner - Story Delivery
 * 
 * Uruchamia Claude jako subprocess i steruje przez stdin/stdout.
 * Wykonuje 7-fazowy workflow TDD dla stories.
 */

import { spawn, ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============== TYPES ==============

interface Step {
    id: string;
    file: string;
    agent?: string;
    timeout_sec?: number;
    retries?: number;
    skip_when?: string | null;
    parallel_group?: string;
    depends_on?: string[];
    on_fail?: string;
    post_checks?: string;
    type?: string;
}

interface Story {
    story_id: string;
    epic: string;
    type: 'backend' | 'frontend' | 'fullstack';
    priority: string;
    complexity: string;
    status: string;
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
    to?: string;
    story: string;
    status: 'success' | 'blocked' | 'partial';
    summary: string;
    files_changed?: string[];
    next_input?: string[];
    blockers?: string[];
    action?: string;
    issues?: Array<{ id: number; severity: string; file: string; issue: string }>;
}

interface PlanConfig {
    version: number;
    runner: {
        claude_cmd: string[];
        ready_marker: string;
        blocked_marker: string;
        pause_marker: string;
        handoff_marker: string;
        session_handoff_marker: string;
        default_timeout_sec: number;
        max_retries_per_step: number;
    };
    stories: {
        input_folder: string;
        processed_folder: string;
        checkpoint_folder: string;
    };
    steps: Step[];
    fix_step: Step;
}

// ============== GLOBALS ==============

let claudeProcess: ChildProcess | null = null;
let currentStory: Story | null = null;
let currentCheckpoint: Checkpoint | null = null;

// ============== HELPERS ==============

function loadPlan(): PlanConfig {
    const planPath = resolve(__dirname, 'plan.yaml');
    const content = readFileSync(planPath, 'utf-8');
    return parseYaml(content) as PlanConfig;
}

function log(message: string) {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${message}`);
}

function logOutput(data: string) {
    process.stdout.write(data);
}

// ============== STORY MANAGEMENT ==============

function loadPendingStories(plan: PlanConfig): Story[] {
    const pendingPath = resolve(__dirname, plan.stories.input_folder);

    if (!existsSync(pendingPath)) {
        mkdirSync(pendingPath, { recursive: true });
        return [];
    }

    const files = readdirSync(pendingPath).filter(f => f.endsWith('.yaml') || f.endsWith('.md'));

    return files.map(file => {
        const content = readFileSync(resolve(pendingPath, file), 'utf-8');
        const storyId = basename(file, '.yaml').replace('.md', '');

        // Parse YAML frontmatter or full YAML
        let parsed: any = {};
        try {
            parsed = parseYaml(content);
        } catch {
            // If not valid YAML, treat as markdown with frontmatter
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                parsed = parseYaml(match[1]);
            }
        }

        return {
            story_id: parsed.story_id || storyId,
            epic: parsed.epic || 'unknown',
            type: parsed.type || 'fullstack',
            priority: parsed.priority || 'P1',
            complexity: parsed.complexity || 'M',
            status: parsed.status || 'pending',
            content
        };
    });
}

function moveToProcessed(story: Story, plan: PlanConfig) {
    const pendingPath = resolve(__dirname, plan.stories.input_folder);
    const processedPath = resolve(__dirname, plan.stories.processed_folder);

    if (!existsSync(processedPath)) {
        mkdirSync(processedPath, { recursive: true });
    }

    const files = readdirSync(pendingPath).filter(f => f.includes(story.story_id));
    for (const file of files) {
        renameSync(
            resolve(pendingPath, file),
            resolve(processedPath, file)
        );
    }

    log(`Story ${story.story_id} moved to processed`);
}

// ============== CHECKPOINT MANAGEMENT ==============

function loadOrCreateCheckpoint(story: Story, plan: PlanConfig): Checkpoint {
    const checkpointPath = resolve(__dirname, plan.stories.checkpoint_folder, `${story.story_id}.yaml`);

    if (existsSync(checkpointPath)) {
        const content = readFileSync(checkpointPath, 'utf-8');
        return parseYaml(content) as Checkpoint;
    }

    // Create new checkpoint
    const checkpoint: Checkpoint = {
        story_id: story.story_id,
        epic: story.epic,
        type: story.type,
        status: 'in_progress',
        phases: {
            P1: null,
            P2: null,
            P3a: null,
            P3b: null,
            P3c: null,
            P3d: null,
            P4: null,
            P5: null,
            P6: null,
            P7: null
        }
    };

    saveCheckpoint(checkpoint, plan);
    return checkpoint;
}

function saveCheckpoint(checkpoint: Checkpoint, plan: PlanConfig) {
    const checkpointDir = resolve(__dirname, plan.stories.checkpoint_folder);

    if (!existsSync(checkpointDir)) {
        mkdirSync(checkpointDir, { recursive: true });
    }

    const checkpointPath = resolve(checkpointDir, `${checkpoint.story_id}.yaml`);
    writeFileSync(checkpointPath, stringifyYaml(checkpoint));
}

function updateCheckpoint(stepId: string, status: string, checkpoint: Checkpoint, plan: PlanConfig) {
    const time = new Date().toISOString().slice(11, 16);
    checkpoint.phases[stepId] = status.startsWith('✓') || status.startsWith('✗')
        ? status
        : `✓ ${status} ${time}`;
    saveCheckpoint(checkpoint, plan);
}

// ============== SKIP LOGIC ==============

function shouldSkipStep(step: Step, story: Story): { skip: boolean; reason: string } {
    if (!step.skip_when) {
        return { skip: false, reason: '' };
    }

    const skipWhen = step.skip_when;

    if (skipWhen === 'backend-only' && story.type === 'backend') {
        return { skip: true, reason: 'backend-only' };
    }

    if (skipWhen === 'frontend-only' && story.type === 'frontend') {
        return { skip: true, reason: 'frontend-only' };
    }

    return { skip: false, reason: '' };
}

// ============== CONTRACT ==============

function buildContract(): string {
    return `
---
KONTRAKT ODPOWIEDZI:
- Sukces: zakończ dokładnie tak:
===HANDOFF===
{handoff YAML}
===NEXT_STEP_READY===

- Problem: zacznij od:
BLOCKED: {powód}
===HANDOFF===
{blocked_handoff YAML}

- Limit kontekstu: zakończ:
===SESSION_HANDOFF===
{session_handoff YAML}
===PAUSE===
---
`;
}

// ============== INSTRUCTION LOADING ==============

function loadInstruction(file: string, story: Story): string {
    const filePath = resolve(__dirname, file);
    if (!existsSync(filePath)) {
        throw new Error(`Instruction file not found: ${filePath}`);
    }

    let content = readFileSync(filePath, 'utf-8');

    // Append story context
    content += `\n\n---\n## STORY CONTEXT\n\`\`\`yaml\n${story.content}\n\`\`\`\n`;

    return content;
}

// ============== HANDOFF PARSING ==============

function parseHandoff(output: string, plan: PlanConfig): Handoff | null {
    const marker = plan.runner.handoff_marker;
    const handoffMatch = output.match(new RegExp(`${marker}\\s*\\n([\\s\\S]*?)(?:${plan.runner.ready_marker}|$)`));

    if (!handoffMatch) {
        return null;
    }

    try {
        return parseYaml(handoffMatch[1].trim()) as Handoff;
    } catch {
        log('Failed to parse handoff YAML');
        return null;
    }
}

// ============== CLAUDE PROCESS ==============

function startClaude(plan: PlanConfig): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
        const [cmd, ...args] = plan.runner.claude_cmd;

        log(`Starting Claude: ${cmd} ${args.join(' ')}`);

        const proc = spawn(cmd, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to start Claude: ${err.message}`));
        });

        proc.stderr?.on('data', (data) => {
            console.error(`[STDERR] ${data.toString()}`);
        });

        setTimeout(() => resolve(proc), 1000);
    });
}

function sendMessage(proc: ChildProcess, message: string): void {
    if (!proc.stdin) {
        throw new Error('Claude stdin not available');
    }

    const fullMessage = message + buildContract();
    proc.stdin.write(fullMessage + '\n');
}

interface WaitResult {
    status: 'ready' | 'blocked' | 'pause';
    output: string;
    handoff: Handoff | null;
    blockReason?: string;
}

function waitForMarker(
    proc: ChildProcess,
    plan: PlanConfig,
    timeoutMs: number
): Promise<WaitResult> {
    return new Promise((resolve, reject) => {
        let buffer = '';
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                reject(new Error(`Timeout after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        const checkBuffer = () => {
            // Check for ready marker
            if (buffer.includes(plan.runner.ready_marker)) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    const handoff = parseHandoff(buffer, plan);
                    resolve({ status: 'ready', output: buffer, handoff });
                }
                return;
            }

            // Check for pause marker
            if (buffer.includes(plan.runner.pause_marker)) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ status: 'pause', output: buffer, handoff: null });
                }
                return;
            }

            // Check for blocked marker
            const lines = buffer.split('\n');
            for (const line of lines) {
                if (line.startsWith(plan.runner.blocked_marker)) {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        const handoff = parseHandoff(buffer, plan);
                        resolve({
                            status: 'blocked',
                            output: buffer,
                            handoff,
                            blockReason: line.substring(plan.runner.blocked_marker.length).trim()
                        });
                    }
                    return;
                }
            }
        };

        proc.stdout?.on('data', (data) => {
            const text = data.toString();
            buffer += text;
            logOutput(text);
            checkBuffer();
        });
    });
}

// ============== STEP EXECUTION ==============

async function pingTest(proc: ChildProcess, plan: PlanConfig): Promise<boolean> {
    log('Step 0: Testing Claude I/O...');

    const pingMessage = `Odpowiedz tylko:\n===NEXT_STEP_READY===`;
    sendMessage(proc, pingMessage);

    try {
        const result = await waitForMarker(proc, plan, 30000);
        if (result.status === 'ready') {
            log('Step 0 (ping): OK');
            return true;
        }
        log(`Step 0 (ping): ${result.status}`);
        return false;
    } catch (err) {
        log(`Step 0 (ping): FAILED - ${err}`);
        return false;
    }
}

async function runStep(
    proc: ChildProcess,
    step: Step,
    story: Story,
    plan: PlanConfig
): Promise<WaitResult> {
    log(`\n${'='.repeat(50)}`);
    log(`Step: ${step.id} | Agent: ${step.agent || 'default'}`);
    log(`${'='.repeat(50)}\n`);

    const instruction = loadInstruction(step.file, story);
    const timeoutMs = (step.timeout_sec || plan.runner.default_timeout_sec) * 1000;

    sendMessage(proc, instruction);

    return waitForMarker(proc, plan, timeoutMs);
}

// ============== MAIN FLOW ==============

async function processStory(proc: ChildProcess, story: Story, plan: PlanConfig) {
    log(`\n${'#'.repeat(60)}`);
    log(`Processing Story: ${story.story_id} (${story.type})`);
    log(`${'#'.repeat(60)}\n`);

    currentStory = story;
    currentCheckpoint = loadOrCreateCheckpoint(story, plan);

    for (const step of plan.steps) {
        // Check STOP file
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file detected. Stopping.');
            break;
        }

        // Check if step should be skipped
        const { skip, reason } = shouldSkipStep(step, story);
        if (skip) {
            log(`Skipping ${step.id}: ${reason}`);
            updateCheckpoint(step.id, `⊘ skipped reason:${reason}`, currentCheckpoint, plan);
            continue;
        }

        // Check if step already completed
        if (currentCheckpoint.phases[step.id]?.startsWith('✓')) {
            log(`${step.id} already completed, skipping.`);
            continue;
        }

        // Skip check-only steps (handled by runner)
        if (step.type === 'check') {
            log(`Running checks: ${step.post_checks}`);
            // TODO: Implement check execution
            continue;
        }

        try {
            const result = await runStep(proc, step, story, plan);

            if (result.status === 'ready') {
                const summary = result.handoff?.summary || 'completed';
                updateCheckpoint(step.id, `✓ ${step.agent || 'agent'} ${summary}`, currentCheckpoint, plan);
                log(`Step ${step.id}: COMPLETED`);

            } else if (result.status === 'blocked') {
                updateCheckpoint(step.id, `✗ ${step.agent || 'agent'} blocked:${result.blockReason}`, currentCheckpoint, plan);
                log(`Step ${step.id}: BLOCKED - ${result.blockReason}`);

                // Handle on_fail routing
                if (step.on_fail) {
                    log(`Routing to: ${step.on_fail}`);
                    // TODO: Implement routing
                }
                break;

            } else if (result.status === 'pause') {
                log(`Step ${step.id}: SESSION PAUSE`);
                currentCheckpoint.status = 'paused';
                saveCheckpoint(currentCheckpoint, plan);
                break;
            }

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            log(`Step ${step.id}: ERROR - ${errorMsg}`);
            updateCheckpoint(step.id, `✗ error:${errorMsg}`, currentCheckpoint, plan);
            break;
        }
    }

    // Check if all phases completed
    const allDone = Object.values(currentCheckpoint.phases).every(
        p => p === null || p.startsWith('✓') || p.startsWith('⊘')
    );

    if (allDone && !Object.values(currentCheckpoint.phases).includes(null)) {
        currentCheckpoint.status = 'done';
        const date = new Date().toISOString().slice(0, 10);
        const time = new Date().toISOString().slice(11, 16);
        currentCheckpoint.phases['COMPLETE'] = `✓ ${date} ${time} status:DONE`;
        saveCheckpoint(currentCheckpoint, plan);
        moveToProcessed(story, plan);
        log(`\nStory ${story.story_id}: COMPLETE ✓`);
    }
}

async function main() {
    log('Claude Workflow Runner - Story Delivery');
    log('========================================\n');

    // Load plan
    const plan = loadPlan();
    log(`Loaded plan.yaml with ${plan.steps.length} steps`);

    // Load pending stories
    const stories = loadPendingStories(plan);
    log(`Found ${stories.length} pending stories`);

    if (stories.length === 0) {
        log('No stories to process. Add stories to stories/pending/');
        process.exit(0);
    }

    // Start Claude
    try {
        claudeProcess = await startClaude(plan);
        log('Claude process started');
    } catch (err) {
        log(`FATAL: ${err}`);
        process.exit(1);
    }

    // Ping test
    const pingOk = await pingTest(claudeProcess, plan);
    if (!pingOk) {
        log('FATAL: Claude I/O not working');
        claudeProcess.kill();
        process.exit(1);
    }

    // Process stories one by one
    for (const story of stories) {
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file detected. Exiting.');
            break;
        }

        await processStory(claudeProcess, story, plan);
    }

    // Cleanup
    log('\nRunner finished. Cleaning up...');
    claudeProcess.kill();
    process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    log('\nSIGINT received. Saving state...');
    if (currentCheckpoint && currentStory) {
        const plan = loadPlan();
        currentCheckpoint.status = 'interrupted';
        saveCheckpoint(currentCheckpoint, plan);
    }
    if (claudeProcess) {
        claudeProcess.kill();
    }
    process.exit(130);
});

// Run
main().catch((err) => {
    console.error('Fatal error:', err);
    if (claudeProcess) {
        claudeProcess.kill();
    }
    process.exit(1);
});
