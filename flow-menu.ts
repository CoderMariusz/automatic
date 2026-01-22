/**
 * Flow Menu - Interactive selection system for Automatic Workflow Runner
 *
 * Displays menu for selecting between PRD Flow, Epic Flow, and Story Flow.
 * Detects in-progress projects and offers resume capability.
 *
 * Usage: npm start (no arguments)
 */

import * as readline from 'readline';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface FlowOption {
    id: string;
    name: string;
    description: string;
    command: string[];
    canResume?: boolean;
    requiresInput?: {
        prompt: string;
        argName: string;
        defaultValue?: string;
    };
}

const FLOWS: FlowOption[] = [
    {
        id: 'prd',
        name: 'PRD Flow',
        description: 'Tworzenie Product Requirements Document - Discovery, Research, Brainstorm',
        command: ['npx', 'tsx', 'prd-runner.ts'],
        canResume: true
    },
    {
        id: 'epic',
        name: 'Epic Flow',
        description: 'Tworzenie epicków i architektury z PRD',
        command: ['npx', 'tsx', 'flow2-runner.ts'],
        canResume: false,
        requiresInput: {
            prompt: 'Podaj ścieżkę do pliku PRD',
            argName: '--prd',
            defaultValue: 'input/prd.md'
        }
    },
    {
        id: 'story',
        name: 'Story Flow',
        description: 'Implementacja story z gotowej specyfikacji',
        command: ['npx', 'tsx', 'runner.ts'],
        canResume: true
    }
];

/**
 * Check for resumable projects in various flows
 * @returns Object with flow ID and checkpoint path, or null if none found
 */
function checkForResumableProject(): { flow: string; checkpoint: string } | null {
    // Check for PRD Flow checkpoint
    const prdCheckpoint = resolve('prd/projects/current/_checkpoint.yaml');
    if (existsSync(prdCheckpoint)) {
        return { flow: 'prd', checkpoint: prdCheckpoint };
    }

    // Future: Check for Epic Flow checkpoint
    // const epicCheckpoint = resolve('epic/projects/current/_checkpoint.yaml');
    // if (existsSync(epicCheckpoint)) {
    //     return { flow: 'epic', checkpoint: epicCheckpoint };
    // }

    // Future: Check for Story Flow checkpoint (if we add similar structure)

    return null;
}

/**
 * Run a flow with given command and optional extra args
 */
function runFlow(flow: FlowOption, extraArgs: string[] = []): void {
    console.log(`\nUruchamiam: \x1b[36m${flow.name}\x1b[0m\n`);

    const proc = spawn(flow.command[0], [...flow.command.slice(1), ...extraArgs], {
        stdio: 'inherit',
        shell: true
    });

    proc.on('exit', (code) => {
        process.exit(code || 0);
    });
}

/**
 * Show main menu with flow options
 */
function showMainMenu(rl: readline.Interface): void {
    FLOWS.forEach((flow, i) => {
        console.log(`  ${i + 1}. \x1b[36m${flow.name}\x1b[0m`);
        console.log(`     ${flow.description}\n`);
    });
    console.log(`  ${FLOWS.length + 1}. Wyjście\n`);

    rl.question('Wybierz opcję (1-4): ', (answer) => {
        const choice = parseInt(answer, 10);

        if (choice >= 1 && choice <= FLOWS.length) {
            const selectedFlow = FLOWS[choice - 1];

            // Check if flow requires input path
            if (selectedFlow.requiresInput) {
                const { prompt, argName, defaultValue } = selectedFlow.requiresInput;
                const defaultHint = defaultValue ? ` [${defaultValue}]` : '';

                rl.question(`${prompt}${defaultHint}: `, (inputPath) => {
                    rl.close();
                    const path = inputPath.trim() || defaultValue || '';

                    if (!path) {
                        console.log('\x1b[31mBrak ścieżki - anulowano.\x1b[0m');
                        process.exit(1);
                    }

                    // Check if file exists
                    if (!existsSync(path)) {
                        console.log(`\x1b[31mPlik nie istnieje: ${path}\x1b[0m`);
                        process.exit(1);
                    }

                    runFlow(selectedFlow, [`${argName}=${path}`]);
                });
            } else {
                rl.close();
                runFlow(selectedFlow);
            }
        } else {
            rl.close();
            console.log('\nDo zobaczenia!\n');
            process.exit(0);
        }
    });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\n\x1b[1m══════════════════════════════════════════════════\x1b[0m');
    console.log('\x1b[1m   Automatic Workflow Runner - Wybierz Flow\x1b[0m');
    console.log('\x1b[1m══════════════════════════════════════════════════\x1b[0m\n');

    // Check for resumable project
    const resumable = checkForResumableProject();

    if (resumable) {
        const flowName = FLOWS.find(f => f.id === resumable.flow)?.name || 'Unknown Flow';
        console.log(`  \x1b[33m⚠️  Znaleziono projekt w trakcie: ${flowName}\x1b[0m\n`);

        rl.question('Wznowić poprzedni projekt? (yes/no): ', (answer) => {
            const response = answer.toLowerCase().trim();

            if (response === 'yes' || response === 'y' || response === 'tak' || response === 't') {
                rl.close();
                const flow = FLOWS.find(f => f.id === resumable.flow)!;
                console.log(`\nWznawianie: \x1b[36m${flow.name}\x1b[0m\n`);

                const proc = spawn(flow.command[0], [...flow.command.slice(1), '--resume'], {
                    stdio: 'inherit',
                    shell: true
                });

                proc.on('exit', (code) => {
                    process.exit(code || 0);
                });
                return;
            }

            // If not resuming, show normal menu
            console.log('\n');
            showMainMenu(rl);
        });
    } else {
        showMainMenu(rl);
    }
}

// Run main function
main().catch((error) => {
    console.error('\x1b[31mError:\x1b[0m', error.message);
    process.exit(1);
});
