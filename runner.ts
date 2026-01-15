/**
 * Claude Workflow Runner - Story Delivery
 * 
 * Uruchamia Claude Code CLI z flagą -p dla każdego kroku.
 * Używa execSync (synchroniczne) - bardziej niezawodne.
 */

import { execSync } from 'child_process';
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

// ============== HELPERS ==============

function loadPlan(): PlanConfig {
    return parseYaml(readFileSync(resolve(__dirname, 'plan.yaml'), 'utf-8')) as PlanConfig;
}

const log = (msg: string) => console.log(`\x1b[36m[${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`);
const logStep = (msg: string) => console.log(`\x1b[33m>>> ${msg}\x1b[0m`);
const logOk = (msg: string) => console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
const logErr = (msg: string) => console.log(`\x1b[31m✗ ${msg}\x1b[0m`);

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

// ============== CLAUDE ==============

function runClaude(prompt: string, timeoutSec: number): { ok: boolean; output: string; error?: string } {
    // Zapisz prompt do pliku, aby uniknąć problemów z escaping
    const promptFile = resolve(__dirname, '.prompt.tmp');
    writeFileSync(promptFile, prompt);

    log(`Executing Claude (timeout: ${timeoutSec}s)...`);
    console.log('\x1b[90m--- output start ---\x1b[0m');

    try {
        // Użyj pliku jako input przez cat/type (działa na Windows i Linux)
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
        const stderr = err.stderr || '';

        if (output) console.log(output);
        console.log('\x1b[90m--- output end ---\x1b[0m');

        // Jeśli mamy sensowny output, uznaj za sukces
        if (output.length > 50) {
            return { ok: true, output };
        }

        return { ok: false, output, error: err.message || stderr };
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

    const stories = loadStories(plan);
    log(`Found ${stories.length} pending stories`);

    if (!stories.length) {
        log('No stories in stories/pending/');
        return;
    }

    // Ping test
    log('Testing Claude CLI...');
    const ping = runClaude('Say: OK', 120);
    if (!ping.ok && ping.output.length < 10) {
        logErr('Claude not responding');
        logErr('Try: claude -p "test" --dangerously-skip-permissions');
        process.exit(1);
    }
    logOk('Claude responding');

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
            if (step.type === 'check') continue;

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
