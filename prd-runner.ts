/**
 * PRD Flow Runner - Product Requirements Document Generator
 *
 * Orchestrates the PRD Flow:
 * PRD-D (Discovery) → PRD-C (Config) → PRD-R (Research) →
 * PRD-B (Brainstorm) → PRD-G (Generate) → PRD-V (Validate) → PRD-A (Approval)
 *
 * Key features:
 * - Interactive conversation loop for discovery/config/brainstorm/approval
 * - Parallel research agent execution
 * - Checkpoint management for resume capability
 * - Conditional step execution based on config
 *
 * Usage:
 *   npm run prd              # Start new PRD
 *   npm run prd -- --resume  # Resume from checkpoint
 *   npm run prd -- --dry-run # Dry run mode
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { createProvider } from './providers/provider-factory.js';
import type { ProviderType } from './providers/base-provider.js';
import type { LogFunction } from './types.js';

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
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    process.env[key] = value;
                }
            }
            console.log(`\x1b[36m[ENV] Loaded ${envFile}\x1b[0m`);
            break;
        }
    }
}
loadEnvFile();

// ============== CLI FLAGS ==============
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MOCK_MODE = args.includes('--mock');
const RESUME_MODE = args.includes('--resume');
const SHOW_HELP = args.includes('--help') || args.includes('-h');

if (SHOW_HELP) {
    console.log(`
PRD Flow Runner - Product Requirements Document Generator

Usage: npm run prd -- [flags]

Flags:
  --resume      Resume from checkpoint (if exists)
  --dry-run     Only log, don't execute LLM calls
  --mock        Simulate execution without LLM calls
  --help, -h    Show this help

Examples:
  npm run prd                  # Start new PRD Flow
  npm run prd -- --resume      # Resume previous session
  npm run prd -- --dry-run     # Test without LLM calls
`);
    process.exit(0);
}

if (DRY_RUN) console.log('\x1b[33m[DRY-RUN MODE]\x1b[0m');
if (MOCK_MODE) console.log('\x1b[35m[MOCK MODE - SIMULATED AI]\x1b[0m');
if (RESUME_MODE) console.log('\x1b[36m[RESUME MODE]\x1b[0m');

// ============== TYPES ==============

interface PRDStep {
    id: string;
    file?: string;
    agent?: string;
    type: 'interactive' | 'llm' | 'script';
    timeout_sec?: number;
    depends_on?: string[];
    parallel_group?: string;
    conditional?: string;
    max_output_tokens?: number;
    description?: string;
    inputs?: string[];
    outputs?: string[];
    script?: string;
    transitions?: Record<string, string>;
}

interface PRDPlanConfig {
    version: number;
    flow_type: string;
    flow_name: string;
    runner: {
        claude_cmd: string[];
        ready_marker: string;
        blocked_marker: string;
        pause_marker: string;
        handoff_marker: string;
        default_timeout_sec: number;
    };
    prd_config: {
        max_tokens: number;
        subdivide_threshold: number;
        research_max_tokens: number;
        project_folder: string;
        current_project: string;
    };
    steps: PRDStep[];
    providers: Record<string, ProviderType>;
    web_search?: Record<string, boolean>;
}

interface PRDCheckpoint {
    project_id: string;
    project_name: string;
    created_at: string;
    last_updated: string;
    completed_steps: string[];
    current_step: string | null;
    status: 'in_progress' | 'completed' | 'cancelled';
}

interface PRDContext {
    projectId: string;
    projectName: string;
    projectDir: string;
    plan: PRDPlanConfig;
    runId: string;
    logDir: string;
    rawLogDir: string;
}

// ============== LOGGING ==============

const LOG_DIR = resolve(__dirname, 'logs');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let RUN_FOLDER = '';
let TIMELINE_LOG = '';
let RAW_LOG_DIR = '';

function setupLogging() {
    if (DRY_RUN) return;
    RUN_FOLDER = resolve(LOG_DIR, `prd-${RUN_ID}`);
    TIMELINE_LOG = resolve(RUN_FOLDER, 'timeline.log');
    RAW_LOG_DIR = resolve(RUN_FOLDER, 'raw');

    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    if (!existsSync(RUN_FOLDER)) mkdirSync(RUN_FOLDER, { recursive: true });
    if (!existsSync(RAW_LOG_DIR)) mkdirSync(RAW_LOG_DIR, { recursive: true });

    writeFileSync(TIMELINE_LOG, `PRD Flow Run ID: ${RUN_ID}\nDate: ${new Date().toISOString()}\n\n`);
}

function logToFile(msg: string) {
    if (DRY_RUN || !TIMELINE_LOG) return;
    try {
        const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, '');
        const oldContent = existsSync(TIMELINE_LOG) ? readFileSync(TIMELINE_LOG, 'utf-8') : '';
        writeFileSync(TIMELINE_LOG, oldContent + cleanMsg + '\n');
    } catch { }
}

const log: LogFunction = (msg: string) => {
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
const logErr: LogFunction = (msg: string) => {
    console.log(`\x1b[31m✗ ${msg}\x1b[0m`);
    logToFile(`✗ ${msg}`);
};
const logInfo = (msg: string) => {
    console.log(`\x1b[35m[INFO] ${msg}\x1b[0m`);
    logToFile(`[INFO] ${msg}`);
};
const logWarn = (msg: string) => {
    console.log(`\x1b[33m[WARN] ${msg}\x1b[0m`);
    logToFile(`[WARN] ${msg}`);
};

// ============== PLAN LOADING ==============

function loadPlan(): PRDPlanConfig {
    const planPath = resolve(__dirname, 'plan-prd.yaml');
    if (!existsSync(planPath)) {
        throw new Error(`Plan file not found: ${planPath}`);
    }
    const content = readFileSync(planPath, 'utf-8');
    return parseYaml(content) as PRDPlanConfig;
}

// ============== PROJECT INITIALIZATION ==============

function initializeProject(plan: PRDPlanConfig, projectName?: string): PRDContext {
    const projectFolder = resolve(__dirname, plan.prd_config.project_folder);
    const projectDir = resolve(projectFolder, plan.prd_config.current_project);

    // Create directory structure
    if (!existsSync(projectDir)) {
        mkdirSync(projectDir, { recursive: true });
    }
    const reportsDir = resolve(projectDir, 'reports');
    const conversationDir = resolve(projectDir, 'conversation');
    if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
    if (!existsSync(conversationDir)) mkdirSync(conversationDir, { recursive: true });

    const projectId = `prd_${RUN_ID}`;
    const name = projectName || 'New PRD Project';

    // Create _meta.yaml
    const metaPath = resolve(projectDir, '_meta.yaml');
    if (!existsSync(metaPath)) {
        const meta = {
            project_id: projectId,
            project_name: name,
            created_at: new Date().toISOString(),
            flow_version: '1.0',
            status: 'in_progress',
            current_step: null,
            completed_steps: []
        };
        writeFileSync(metaPath, stringifyYaml(meta));
        logOk(`Created project: ${projectDir}`);
    } else {
        log(`Using existing project: ${projectDir}`);
    }

    return {
        projectId,
        projectName: name,
        projectDir,
        plan,
        runId: RUN_ID,
        logDir: RUN_FOLDER,
        rawLogDir: RAW_LOG_DIR
    };
}

// ============== CHECKPOINT MANAGEMENT ==============

function loadCheckpoint(ctx: PRDContext): PRDCheckpoint | null {
    const checkpointPath = resolve(ctx.projectDir, '_checkpoint.yaml');
    if (!existsSync(checkpointPath)) {
        return null;
    }
    return parseYaml(readFileSync(checkpointPath, 'utf-8')) as PRDCheckpoint;
}

function saveCheckpoint(ctx: PRDContext, stepId: string, status: 'in_progress' | 'completed' | 'cancelled' = 'in_progress'): void {
    const checkpointPath = resolve(ctx.projectDir, '_checkpoint.yaml');

    let checkpoint: PRDCheckpoint;
    if (existsSync(checkpointPath)) {
        checkpoint = parseYaml(readFileSync(checkpointPath, 'utf-8')) as PRDCheckpoint;
    } else {
        checkpoint = {
            project_id: ctx.projectId,
            project_name: ctx.projectName,
            created_at: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            completed_steps: [],
            current_step: null,
            status: 'in_progress'
        };
    }

    // Add to completed steps if not already there
    if (!checkpoint.completed_steps.includes(stepId)) {
        checkpoint.completed_steps.push(stepId);
    }

    checkpoint.last_updated = new Date().toISOString();
    checkpoint.current_step = null;
    checkpoint.status = status;

    writeFileSync(checkpointPath, stringifyYaml(checkpoint));
    logInfo(`Checkpoint saved: ${stepId}`);
}

function shouldSkipStep(step: PRDStep, checkpoint: PRDCheckpoint | null): boolean {
    if (!checkpoint) return false;
    return checkpoint.completed_steps.includes(step.id);
}

// ============== CONDITIONAL EVALUATION ==============

function evaluateConditional(conditional: string, ctx: PRDContext): boolean {
    // Load research-config.yaml
    const configPath = resolve(ctx.projectDir, 'research-config.yaml');
    if (!existsSync(configPath)) {
        logWarn(`Conditional check failed: research-config.yaml not found`);
        return false;
    }

    try {
        const config = parseYaml(readFileSync(configPath, 'utf-8'));

        // Parse path like "research_config.tech.enabled"
        const pathParts = conditional.split('.');
        let value: any = config;

        for (const part of pathParts) {
            if (value === undefined || value === null) return false;
            value = value[part];
        }

        return value === true;
    } catch (err) {
        logWarn(`Error evaluating conditional: ${conditional}`);
        return false;
    }
}

// ============== INPUT FILE INJECTION ==============

function loadInputFiles(step: PRDStep, ctx: PRDContext): string {
    if (!step.inputs || step.inputs.length === 0) return '';

    let inputContent = '\n\n## INPUT FILES\n\n';

    for (const inputPattern of step.inputs) {
        if (inputPattern.includes('*')) {
            // Glob pattern (e.g., "reports/*.md")
            const dir = resolve(ctx.projectDir, dirname(inputPattern));
            const pattern = inputPattern.split('/').pop() || '';
            const ext = pattern.replace('*', '');

            if (existsSync(dir)) {
                const files = readdirSync(dir).filter(f => f.endsWith(ext));
                for (const file of files) {
                    const filePath = resolve(dir, file);
                    const content = readFileSync(filePath, 'utf-8');
                    inputContent += `### File: ${inputPattern.replace('*', file.replace(ext, ''))}\n\`\`\`\n${content}\n\`\`\`\n\n`;
                }
            }
        } else {
            // Single file
            const filePath = resolve(ctx.projectDir, inputPattern);
            if (existsSync(filePath)) {
                const content = readFileSync(filePath, 'utf-8');
                const ext = inputPattern.split('.').pop() || '';
                inputContent += `### File: ${inputPattern}\n\`\`\`${ext === 'yaml' ? 'yaml' : ext === 'md' ? 'markdown' : ''}\n${content}\n\`\`\`\n\n`;
            } else {
                logWarn(`Input file not found: ${inputPattern}`);
            }
        }
    }

    return inputContent;
}

// ============== OUTPUT EXTRACTION ==============

function extractYamlFromOutput(output: string): string {
    // Try to extract from ```yaml code block
    const yamlMatch = output.match(/```ya?ml\n([\s\S]+?)\n```/);
    if (yamlMatch) {
        return yamlMatch[1].trim();
    }

    // Fall back to raw YAML detection
    const lines = output.split('\n');
    const yamlLines: string[] = [];
    let inYaml = false;

    for (const line of lines) {
        if (/^[a-z_]+:/.test(line) || (inYaml && /^\s+/.test(line)) || (inYaml && /^\s*-\s/.test(line))) {
            inYaml = true;
        }
        if (inYaml) {
            if (/^===[A-Z_]+===/.test(line)) break;
            yamlLines.push(line);
        }
    }

    return yamlLines.join('\n').trim();
}

function extractMarkdownFromOutput(output: string): string {
    // Extract everything before ===NEXT_STEP_READY=== marker
    const parts = output.split(/===NEXT_STEP_READY===/);
    let content = parts[0].trim();

    // Also remove other markers
    content = content.replace(/===\w+===/g, '').trim();

    return content;
}

async function saveStepOutputs(step: PRDStep, output: string, ctx: PRDContext): Promise<void> {
    if (!step.outputs) return;

    for (const outputFile of step.outputs) {
        const filePath = resolve(ctx.projectDir, outputFile);
        const dir = dirname(filePath);

        // Ensure directory exists
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        let content: string;

        if (outputFile.endsWith('.yaml') || outputFile.endsWith('.yml')) {
            content = extractYamlFromOutput(output);
        } else if (outputFile.endsWith('.md')) {
            content = extractMarkdownFromOutput(output);
        } else {
            content = output;
        }

        writeFileSync(filePath, content, 'utf-8');
        logOk(`Saved: ${outputFile}`);
    }
}

// ============== READLINE HELPER ==============

function askUser(prompt: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// ============== PROVIDER EXECUTION ==============

function getProviderForStep(step: PRDStep, plan: PRDPlanConfig): ProviderType {
    if (plan.providers && plan.providers[step.id]) {
        return plan.providers[step.id];
    }
    return 'claude';
}

async function executeLLM(
    prompt: string,
    timeoutSec: number,
    stepId: string,
    providerType: ProviderType,
    ctx: PRDContext
): Promise<{ ok: boolean; output: string; error?: string }> {
    if (DRY_RUN) {
        log(`[DRY-RUN] Would execute ${providerType} for ${stepId}`);
        return { ok: true, output: '[DRY-RUN OUTPUT]' };
    }

    if (MOCK_MODE) {
        log(`[MOCK] Simulating ${providerType} for ${stepId}...`);
        await new Promise(r => setTimeout(r, 2000));
        return { ok: true, output: `[MOCK OUTPUT for ${stepId}]\n\n===NEXT_STEP_READY===` };
    }

    const provider = createProvider(
        providerType,
        log,
        logErr,
        DRY_RUN,
        MOCK_MODE,
        ctx.rawLogDir
    );

    return await provider.execute(prompt, timeoutSec, stepId);
}

// ============== STEP EXECUTION ==============

async function runInteractiveStep(step: PRDStep, ctx: PRDContext): Promise<boolean> {
    logStep(`[INTERACTIVE] ${step.id}: ${step.description || step.agent}`);

    const instructionPath = resolve(__dirname, step.file!);
    if (!existsSync(instructionPath)) {
        logErr(`Instruction file not found: ${step.file}`);
        return false;
    }

    let instruction = readFileSync(instructionPath, 'utf-8');

    // Inject input files
    const inputContent = loadInputFiles(step, ctx);
    instruction += inputContent;

    const providerType = getProviderForStep(step, ctx.plan);
    const timeoutSec = step.timeout_sec || ctx.plan.runner.default_timeout_sec;

    let conversationHistory: string[] = [instruction];
    let isComplete = false;
    let fullOutput = '';

    console.log('\n\x1b[36m════════════════════════════════════════════════════════════\x1b[0m');
    console.log(`\x1b[36m  Starting: ${step.agent || step.id}\x1b[0m`);
    console.log('\x1b[36m════════════════════════════════════════════════════════════\x1b[0m\n');

    while (!isComplete) {
        const fullPrompt = conversationHistory.join('\n\n---\n\n');

        const result = await executeLLM(fullPrompt, timeoutSec, step.id, providerType, ctx);

        if (!result.ok) {
            logErr(`Agent ${step.id} failed: ${result.error}`);
            return false;
        }

        fullOutput = result.output;

        // Check for completion marker
        if (result.output.includes(ctx.plan.runner.ready_marker)) {
            isComplete = true;
            logOk(`${step.id} completed`);
        } else {
            // Display agent's message to user
            console.log(`\n\x1b[32m[${step.agent || step.id}]\x1b[0m\n`);
            console.log(result.output);
            console.log('');

            // Get user input
            const userInput = await askUser('\x1b[33mYour response:\x1b[0m ');

            // Add to conversation
            conversationHistory.push(`ASSISTANT: ${result.output}`);
            conversationHistory.push(`USER: ${userInput}`);
        }
    }

    // Save conversation log
    const logPath = resolve(ctx.projectDir, 'conversation', `${step.id}.log`);
    writeFileSync(logPath, conversationHistory.join('\n\n---\n\n'));

    // Extract and save outputs
    await saveStepOutputs(step, fullOutput, ctx);

    // Save checkpoint (interactive steps)
    saveCheckpoint(ctx, step.id);

    return true;
}

async function runLLMStep(step: PRDStep, ctx: PRDContext): Promise<boolean> {
    logStep(`[LLM] ${step.id}: ${step.description || step.agent}`);

    const instructionPath = resolve(__dirname, step.file!);
    if (!existsSync(instructionPath)) {
        logErr(`Instruction file not found: ${step.file}`);
        return false;
    }

    let instruction = readFileSync(instructionPath, 'utf-8');

    // Inject input files
    const inputContent = loadInputFiles(step, ctx);
    instruction += inputContent;

    // Add web search hint if enabled
    if (ctx.plan.web_search && ctx.plan.web_search[step.id]) {
        instruction += `\n\n## WEB SEARCH ENABLED

You have access to web search. Use it to find:
- Current pricing for cloud services (as of ${new Date().getFullYear()})
- Latest versions of libraries and frameworks
- Recent blog posts and documentation updates
- Competitor features and pricing (visit their websites)

When you cite information from web search, include the source:
Example: "According to Vercel's pricing page (${new Date().getFullYear()}), the Pro plan costs $20/month..."
`;
    }

    const providerType = getProviderForStep(step, ctx.plan);
    const timeoutSec = step.timeout_sec || ctx.plan.runner.default_timeout_sec;

    const result = await executeLLM(instruction, timeoutSec, step.id, providerType, ctx);

    if (!result.ok) {
        logErr(`Step ${step.id} failed: ${result.error}`);
        return false;
    }

    // Extract and save outputs
    await saveStepOutputs(step, result.output, ctx);

    logOk(`${step.id} completed`);
    return true;
}

async function runScriptStep(step: PRDStep, ctx: PRDContext): Promise<boolean> {
    logStep(`[SCRIPT] ${step.id}: ${step.description}`);

    if (!step.script) {
        logErr(`Script path not specified for ${step.id}`);
        return false;
    }

    const scriptPath = resolve(__dirname, step.script);
    if (!existsSync(scriptPath)) {
        logErr(`Script not found: ${step.script}`);
        return false;
    }

    if (DRY_RUN) {
        log(`[DRY-RUN] Would execute: npx tsx ${step.script}`);
        return true;
    }

    try {
        // Set environment variables
        process.env.PROJECT_DIR = ctx.projectDir;
        process.env.PROJECT_ID = ctx.projectId;

        execSync(`npx tsx ${scriptPath}`, {
            cwd: __dirname,
            stdio: 'inherit',
            env: process.env
        });

        logOk(`${step.id} completed`);
        return true;
    } catch (err: any) {
        logErr(`Script ${step.id} failed: ${err.message}`);
        return false;
    }
}

// ============== PARALLEL EXECUTION ==============

async function runParallelGroup(steps: PRDStep[], ctx: PRDContext, checkpoint: PRDCheckpoint | null): Promise<boolean> {
    // Filter steps: skip completed, evaluate conditionals
    const stepsToRun: PRDStep[] = [];

    for (const step of steps) {
        // Skip if already completed
        if (shouldSkipStep(step, checkpoint)) {
            logInfo(`Skipping ${step.id} (already completed)`);
            continue;
        }

        // Evaluate conditional
        if (step.conditional) {
            const shouldRun = evaluateConditional(step.conditional, ctx);
            if (!shouldRun) {
                logInfo(`Skipping ${step.id} (conditional=false)`);
                continue;
            }
        }

        stepsToRun.push(step);
    }

    if (stepsToRun.length === 0) {
        logWarn('No steps to run in parallel group');
        return true;
    }

    logStep(`Running ${stepsToRun.length} steps in parallel: ${stepsToRun.map(s => s.id).join(', ')}`);

    // Execute all in parallel
    const results = await Promise.all(
        stepsToRun.map(step => runLLMStep(step, ctx))
    );

    // Check if all succeeded
    const allSuccess = results.every(r => r === true);

    if (!allSuccess) {
        const failed = stepsToRun.filter((_, i) => !results[i]).map(s => s.id);
        logErr(`Parallel group failed. Failed steps: ${failed.join(', ')}`);
        return false;
    }

    return true;
}

// ============== MAIN FLOW ==============

async function runPRDFlow(): Promise<void> {
    console.log('\n\x1b[1m══════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[1m   PRD Flow - Product Requirements Document\x1b[0m');
    console.log('\x1b[1m══════════════════════════════════════════════════\x1b[0m\n');

    setupLogging();

    // Load plan
    const plan = loadPlan();
    log(`Loaded plan: ${plan.flow_name}`);

    // Initialize project
    const ctx = initializeProject(plan);
    log(`Project directory: ${ctx.projectDir}`);

    // Load checkpoint if resume mode
    let checkpoint: PRDCheckpoint | null = null;
    if (RESUME_MODE) {
        checkpoint = loadCheckpoint(ctx);
        if (checkpoint) {
            log(`Resuming from checkpoint. Completed steps: ${checkpoint.completed_steps.join(', ')}`);
        } else {
            log('No checkpoint found, starting fresh');
        }
    }

    // Group steps by parallel_group
    const stepGroups: Map<string, PRDStep[]> = new Map();
    const sequentialSteps: PRDStep[] = [];

    for (const step of plan.steps) {
        if (step.parallel_group) {
            const group = stepGroups.get(step.parallel_group) || [];
            group.push(step);
            stepGroups.set(step.parallel_group, group);
        } else {
            sequentialSteps.push(step);
        }
    }

    // Execute steps in order
    let currentParallelGroup: string | null = null;

    for (const step of plan.steps) {
        // Handle parallel groups
        if (step.parallel_group) {
            // Only process parallel group once (when we first encounter it)
            if (currentParallelGroup !== step.parallel_group) {
                currentParallelGroup = step.parallel_group;

                const parallelSteps = stepGroups.get(step.parallel_group)!;

                // Check dependencies for entire group
                const groupDependencies = new Set<string>();
                for (const pStep of parallelSteps) {
                    if (pStep.depends_on) {
                        pStep.depends_on.forEach(d => groupDependencies.add(d));
                    }
                }

                // Check if all dependencies are met
                const completedSteps = checkpoint?.completed_steps || [];
                const unmetDeps = Array.from(groupDependencies).filter(
                    dep => !completedSteps.includes(dep) && !parallelSteps.some(s => s.id === dep)
                );

                if (unmetDeps.length > 0) {
                    logErr(`Parallel group ${step.parallel_group} has unmet dependencies: ${unmetDeps.join(', ')}`);
                    return;
                }

                // Run parallel group
                const success = await runParallelGroup(parallelSteps, ctx, checkpoint);
                if (!success) {
                    logErr(`PRD Flow failed at parallel group: ${step.parallel_group}`);
                    return;
                }
            }
            continue;
        }

        // Reset parallel group tracker
        currentParallelGroup = null;

        // Skip if already completed (for sequential steps)
        if (shouldSkipStep(step, checkpoint)) {
            logInfo(`Skipping ${step.id} (already completed)`);
            continue;
        }

        // Check dependencies
        if (step.depends_on && step.depends_on.length > 0) {
            const completedSteps = checkpoint?.completed_steps || [];
            // For parallel groups, also check if all group members completed
            const unmetDeps = step.depends_on.filter(dep => {
                // Check if it's a direct completion
                if (completedSteps.includes(dep)) return false;

                // Check if it's a parallel group step that's been run
                const depStep = plan.steps.find(s => s.id === dep);
                if (depStep?.parallel_group) {
                    // Check if parallel group was processed (any member completed)
                    const groupSteps = stepGroups.get(depStep.parallel_group) || [];
                    return !groupSteps.some(s => completedSteps.includes(s.id));
                }

                return true;
            });

            if (unmetDeps.length > 0) {
                logErr(`Step ${step.id} has unmet dependencies: ${unmetDeps.join(', ')}`);
                return;
            }
        }

        // Execute step based on type
        let success = false;

        switch (step.type) {
            case 'interactive':
                success = await runInteractiveStep(step, ctx);
                break;
            case 'llm':
                success = await runLLMStep(step, ctx);
                break;
            case 'script':
                success = await runScriptStep(step, ctx);
                break;
            default:
                logErr(`Unknown step type: ${step.type}`);
                return;
        }

        if (!success) {
            logErr(`PRD Flow failed at step: ${step.id}`);
            return;
        }

        // Update checkpoint after sequential step
        if (!checkpoint) {
            checkpoint = {
                project_id: ctx.projectId,
                project_name: ctx.projectName,
                created_at: new Date().toISOString(),
                last_updated: new Date().toISOString(),
                completed_steps: [step.id],
                current_step: null,
                status: 'in_progress'
            };
        } else {
            checkpoint.completed_steps.push(step.id);
            checkpoint.last_updated = new Date().toISOString();
        }
    }

    // Mark as completed
    saveCheckpoint(ctx, 'FLOW_COMPLETE', 'completed');

    console.log('\n\x1b[32m══════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[32m   PRD Flow completed successfully!\x1b[0m');
    console.log('\x1b[32m══════════════════════════════════════════════════\x1b[0m\n');
    console.log(`\x1b[36mPRD saved to:\x1b[0m ${ctx.projectDir}/prd.md`);
    console.log('');
}

// ============== ENTRY POINT ==============

runPRDFlow().catch((err) => {
    logErr(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
});
