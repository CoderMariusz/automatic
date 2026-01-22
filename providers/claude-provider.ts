/**
 * Claude Provider - uses Claude CLI with non-blocking polling
 */
import { spawn, ChildProcess } from 'child_process';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync } from 'fs';
import { LLMProvider } from './base-provider.js';
import type { LogFunction, PollingConfig } from '../types.js';
import { DEFAULT_POLLING_CONFIG, formatElapsed } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ClaudeProvider implements LLMProvider {
    private pollingConfig: PollingConfig;

    constructor(
        private log: LogFunction,
        private logErr: LogFunction,
        private dryRun: boolean,
        private mockMode: boolean,
        private rawLogDir?: string,
        pollingConfig?: Partial<PollingConfig>
    ) {
        this.pollingConfig = { ...DEFAULT_POLLING_CONFIG, ...pollingConfig };
    }

    /**
     * Execute Claude CLI with non-blocking polling
     * Shows progress updates every polling interval while waiting for response
     */
    async execute(
        prompt: string,
        timeoutSec: number,
        stepId: string
    ): Promise<{ ok: boolean; output: string; error?: string }> {
        if (this.dryRun) {
            this.log(`[DRY-RUN] [${stepId}] Would execute Claude with prompt`);
            return { ok: true, output: '[dry-run output]' };
        }

        if (this.mockMode) {
            this.log(`[MOCK] [${stepId}] Simulating Claude (2s delay)...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return { ok: true, output: '===NEXT_STEP_READY===\nMock successful.' };
        }

        const simpleId = new Date().toISOString().slice(11, 19).replace(/:/g, '');
        const safeStepId = stepId.replace(/[^a-zA-Z0-9-]/g, '_');
        const promptFile = pathResolve(__dirname, '..', `.prompt.${safeStepId}.tmp`);
        writeFileSync(promptFile, prompt);

        // Save raw input
        if (this.rawLogDir && existsSync(this.rawLogDir)) {
            writeFileSync(pathResolve(this.rawLogDir, `${simpleId}_${safeStepId}_input.md`), prompt);
        }

        this.log(`[${stepId}] Starting Claude (timeout: ${timeoutSec}s, polling: ${this.pollingConfig.intervalMs / 1000}s)...`);

        // Use non-blocking polling execution
        const result = await this.executeWithPolling(promptFile, timeoutSec, stepId, safeStepId, simpleId);

        return result;
    }

    /**
     * Non-blocking polling execution - spawns process and polls for completion
     * Allows the event loop to continue between polls, enabling concurrent operations
     */
    private executeWithPolling(
        promptFile: string,
        timeoutSec: number,
        stepId: string,
        safeStepId: string,
        simpleId: string
    ): Promise<{ ok: boolean; output: string; error?: string }> {
        return new Promise((resolvePromise) => {
            const startTime = Date.now();
            const timeoutMs = timeoutSec * 1000;

            // Accumulate output
            let stdout = '';
            let stderr = '';
            let processComplete = false;
            let promiseResolved = false; // Prevent double resolution
            let exitCode: number | null = null;

            // Spawn the Claude CLI process
            const isWindows = process.platform === 'win32';
            let childProcess: ChildProcess;

            if (isWindows) {
                // On Windows, use cmd.exe to pipe the file content
                childProcess = spawn('cmd.exe', [
                    '/c',
                    `type "${promptFile}" | claude -p - --dangerously-skip-permissions`
                ], {
                    shell: false,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            } else {
                // On Unix, use sh to pipe
                childProcess = spawn('sh', [
                    '-c',
                    `cat "${promptFile}" | claude -p - --dangerously-skip-permissions`
                ], {
                    shell: false,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            }

            // Collect stdout
            childProcess.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            // Collect stderr
            childProcess.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            // Handle process completion
            childProcess.on('close', (code) => {
                processComplete = true;
                exitCode = code;
            });

            childProcess.on('error', (err) => {
                processComplete = true;
                stderr += `\nProcess error: ${err.message}`;
                exitCode = -1;
            });

            // Helper to safely resolve the promise only once
            const safeResolve = (success: boolean, output: string, errorMsg: string | undefined, reason: string) => {
                if (promiseResolved) return;
                promiseResolved = true;

                const elapsed = Date.now() - startTime;
                this.log(`[${stepId}] Claude ${reason} after ${formatElapsed(elapsed)}`);
                this.finishExecution(resolvePromise, success, output, errorMsg, safeStepId, simpleId);
            };

            // Polling loop with progress updates
            const pollInterval = setInterval(() => {
                if (promiseResolved) {
                    clearInterval(pollInterval);
                    return;
                }

                const elapsed = Date.now() - startTime;

                // Check for timeout
                if (elapsed >= timeoutMs) {
                    clearInterval(pollInterval);

                    // Kill the process if still running
                    if (!processComplete) {
                        this.logErr(`[${stepId}] Timeout after ${formatElapsed(elapsed)} - killing process`);
                        childProcess.kill('SIGTERM');

                        // Force kill after 5 seconds if still running
                        setTimeout(() => {
                            if (!processComplete) {
                                childProcess.kill('SIGKILL');
                            }
                        }, 5000);
                    }

                    safeResolve(false, stdout, 'timeout', 'timed out');
                    return;
                }

                // Check if process completed
                if (processComplete) {
                    clearInterval(pollInterval);

                    const success = exitCode === 0 || stdout.length > 50;
                    const errorMsg = exitCode !== 0 ? `Exit code: ${exitCode}${stderr ? `, stderr: ${stderr.slice(0, 200)}` : ''}` : undefined;

                    safeResolve(success, stdout, errorMsg, 'responded');
                    return;
                }

                // Show progress update
                if (this.pollingConfig.showProgress) {
                    const outputPreview = stdout.length > 0
                        ? ` (${stdout.length} chars received)`
                        : '';
                    this.log(`[${stepId}] Still waiting for Claude... ${formatElapsed(elapsed)} elapsed${outputPreview}`);
                }

            }, this.pollingConfig.intervalMs);

            // Quick completion checker for fast responses (500ms intervals)
            // This ensures we don't wait up to 10 seconds for quick responses
            const checkCompletion = () => {
                if (promiseResolved) return;

                if (processComplete) {
                    clearInterval(pollInterval);

                    const success = exitCode === 0 || stdout.length > 50;
                    const errorMsg = exitCode !== 0 ? `Exit code: ${exitCode}${stderr ? `, stderr: ${stderr.slice(0, 200)}` : ''}` : undefined;

                    safeResolve(success, stdout, errorMsg, 'responded');
                } else {
                    // Check again after a short delay for quick responses
                    setTimeout(checkCompletion, 500);
                }
            };

            // Start quick completion checking
            setTimeout(checkCompletion, 500);
        });
    }

    /**
     * Finalize execution - save logs and resolve the promise
     */
    private finishExecution(
        resolvePromise: (result: { ok: boolean; output: string; error?: string }) => void,
        success: boolean,
        output: string,
        errorMsg: string | undefined,
        safeStepId: string,
        simpleId: string
    ): void {
        // Save raw output
        if (this.rawLogDir && existsSync(this.rawLogDir)) {
            writeFileSync(
                pathResolve(this.rawLogDir, `${simpleId}_${safeStepId}_${success ? 'ok' : 'fail'}.md`),
                output + (errorMsg ? `\n\nERROR: ${errorMsg}` : '')
            );
        }

        resolvePromise({ ok: success, output, error: errorMsg });
    }
}
