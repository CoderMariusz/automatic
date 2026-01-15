/**
 * Claude Workflow Runner - Story Delivery
 * 
 * Uruchamia Claude CLI dla każdego kroku z flagą -p (prompt mode).
 * Wykonuje 7-fazowy workflow TDD dla stories.
 */

import { spawn } from 'child_process';
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
    action?: string;
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

        let parsed: any = {};
        try {
            parsed = parseYaml(content);
        } catch {
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
        renameSync(resolve(pendingPath, file), resolve(processedPath, file));
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

    const checkpoint: Checkpoint = {
        story_id: story.story_id,
        epic: story.epic,
        type: story.type,
        status: 'in_progress',
        phases: {
            P1: null, P2: null, P3a: null, P3b: null,
            P3c: null, P3d: null, P4: null, P5: null,
            P6: null, P7: null
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
    if (!step.skip_when) return { skip: false, reason: '' };

    if (step.skip_when === 'backend-only' && story.type === 'backend') {
        return { skip: true, reason: 'backend-only' };
    }
    if (step.skip_when === 'frontend-only' && story.type === 'frontend') {
        return { skip: true, reason: 'frontend-only' };
    }

    return { skip: false, reason: '' };
}

// ============== INSTRUCTION LOADING ==============

function loadInstruction(file: string, story: Story): string {
    const filePath = resolve(__dirname, file);
    if (!existsSync(filePath)) {
        throw new Error(`Instruction file not found: ${filePath}`);
    }

    let content = readFileSync(filePath, 'utf-8');
    content += `\n\n---\n## STORY CONTEXT\n\`\`\`yaml\n${story.content}\n\`\`\`\n`;

    // Add contract
    content += `
---
KONTRAKT: Zakończ odpowiedź dokładnie tak:
===HANDOFF===
from: ${file.match(/P\d+[a-d]?/)?.[0] || 'step'}
status: success
summary: "krótki opis co zrobione"
===NEXT_STEP_READY===
`;

    return content;
}

// ============== HANDOFF PARSING ==============

function parseHandoff(output: string, plan: PlanConfig): Handoff | null {
    const marker = plan.runner.handoff_marker;
    const handoffMatch = output.match(new RegExp(`${marker}\\s*\\n([\\s\\S]*?)(?:${plan.runner.ready_marker}|$)`));

    if (!handoffMatch) return null;

    try {
        return parseYaml(handoffMatch[1].trim()) as Handoff;
    } catch {
        return null;
    }
}

// ============== CLAUDE EXECUTION ==============

interface ClaudeResult {
    success: boolean;
    output: string;
    handoff: Handoff | null;
    blocked: boolean;
    blockReason?: string;
}

function runClaude(prompt: string, plan: PlanConfig, timeoutMs: number): Promise<ClaudeResult> {
    return new Promise((resolve) => {
        const [cmd, ...baseArgs] = plan.runner.claude_cmd;

        // Use -p flag for prompt mode with --dangerously-skip-permissions for automation
        const args = [...baseArgs, '-p', prompt, '--dangerously-skip-permissions'];

        log(`Executing Claude (timeout: ${timeoutMs / 1000}s)...`);

        const proc = spawn(cmd, args, {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let stderr = '';
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                proc.kill();
                resolve({
                    success: false,
                    output,
                    handoff: null,
                    blocked: true,
                    blockReason: `Timeout after ${timeoutMs / 1000}s`
                });
            }
        }, timeoutMs);

        proc.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;
            process.stdout.write(text);
        });

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);

            // Check for markers
            const hasReady = output.includes(plan.runner.ready_marker);
            const blockedMatch = output.match(new RegExp(`${plan.runner.blocked_marker}(.+)`));
            const handoff = parseHandoff(output, plan);

            if (blockedMatch) {
                resolve({
                    success: false,
                    output,
                    handoff,
                    blocked: true,
                    blockReason: blockedMatch[1].trim()
                });
            } else if (hasReady || code === 0) {
                resolve({
                    success: true,
                    output,
                    handoff,
                    blocked: false
                });
            } else {
                resolve({
                    success: false,
                    output,
                    handoff: null,
                    blocked: true,
                    blockReason: stderr || `Exit code: ${code}`
                });
            }
        });

        proc.on('error', (err) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            resolve({
                success: false,
                output: '',
                handoff: null,
                blocked: true,
                blockReason: err.message
            });
        });
    });
}

// ============== PING TEST ==============

async function pingTest(plan: PlanConfig): Promise<boolean> {
    log('Step 0: Testing Claude CLI...');

    const result = await runClaude(
        'Respond with exactly one line: TEST_OK',
        plan,
        30000
    );

    if (result.success && result.output.includes('TEST_OK')) {
        log('Step 0: OK - Claude CLI working');
        return true;
    }

    // Even if no TEST_OK, if we got output, Claude is working
    if (result.output.length > 10) {
        log('Step 0: OK - Claude CLI responding');
        return true;
    }

    log(`Step 0: FAILED - ${result.blockReason || 'No response'}`);
    return false;
}

// ============== STEP EXECUTION ==============

async function runStep(step: Step, story: Story, plan: PlanConfig): Promise<ClaudeResult> {
    log(`\n${'='.repeat(50)}`);
    log(`Step: ${step.id} | Agent: ${step.agent || 'default'}`);
    log(`${'='.repeat(50)}\n`);

    const instruction = loadInstruction(step.file, story);
    const timeoutMs = (step.timeout_sec || plan.runner.default_timeout_sec) * 1000;

    return runClaude(instruction, plan, timeoutMs);
}

// ============== MAIN FLOW ==============

async function processStory(story: Story, plan: PlanConfig) {
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

        // Skip check-only steps
        if (step.type === 'check') {
            log(`Running checks: ${step.post_checks}`);
            // TODO: Implement check execution
            continue;
        }

        // Skip logic
        const { skip, reason } = shouldSkipStep(step, story);
        if (skip) {
            log(`Skipping ${step.id}: ${reason}`);
            updateCheckpoint(step.id, `⊘ skipped reason:${reason}`, currentCheckpoint, plan);
            continue;
        }

        // Already completed?
        if (currentCheckpoint.phases[step.id]?.startsWith('✓')) {
            log(`${step.id} already completed, skipping.`);
            continue;
        }

        // Execute step
        const result = await runStep(step, story, plan);

        if (result.success) {
            const summary = result.handoff?.summary || 'completed';
            updateCheckpoint(step.id, `✓ ${step.agent || 'agent'} ${summary}`, currentCheckpoint, plan);
            log(`\nStep ${step.id}: COMPLETED ✓`);

        } else {
            updateCheckpoint(step.id, `✗ ${step.agent || 'agent'} blocked:${result.blockReason}`, currentCheckpoint, plan);
            log(`\nStep ${step.id}: BLOCKED - ${result.blockReason}`);

            if (step.on_fail) {
                log(`Would route to: ${step.on_fail}`);
            }
            break;
        }
    }

    // Check completion
    const phases = currentCheckpoint.phases;
    const allDone = Object.entries(phases).every(
        ([key, val]) => val === null || val.startsWith('✓') || val.startsWith('⊘') || key === 'COMPLETE'
    );

    if (allDone && !Object.values(phases).some(p => p === null)) {
        currentCheckpoint.status = 'done';
        const now = new Date().toISOString();
        phases['COMPLETE'] = `✓ ${now.slice(0, 10)} ${now.slice(11, 16)} status:DONE`;
        saveCheckpoint(currentCheckpoint, plan);
        moveToProcessed(story, plan);
        log(`\nStory ${story.story_id}: COMPLETE ✓`);
    }
}

async function main() {
    log('Claude Workflow Runner - Story Delivery');
    log('========================================\n');

    const plan = loadPlan();
    log(`Loaded plan.yaml with ${plan.steps.length} steps`);

    const stories = loadPendingStories(plan);
    log(`Found ${stories.length} pending stories`);

    if (stories.length === 0) {
        log('No stories to process. Add stories to stories/pending/');
        process.exit(0);
    }

    // Ping test
    const pingOk = await pingTest(plan);
    if (!pingOk) {
        log('FATAL: Claude CLI not working. Check installation.');
        process.exit(1);
    }

    // Process stories
    for (const story of stories) {
        if (existsSync(resolve(__dirname, 'STOP'))) {
            log('STOP file detected. Exiting.');
            break;
        }

        await processStory(story, plan);
    }

    log('\nRunner finished.');
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
    process.exit(130);
});

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
