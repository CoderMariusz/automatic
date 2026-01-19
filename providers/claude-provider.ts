/**
 * Claude Provider - uses Claude CLI
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync } from 'fs';
import { LLMProvider } from './base-provider.js';
import type { LogFunction } from '../types.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ClaudeProvider implements LLMProvider {
    constructor(
        private log: LogFunction,
        private logErr: LogFunction,
        private dryRun: boolean,
        private mockMode: boolean,
        private rawLogDir?: string
    ) {}

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
        const promptFile = resolve(__dirname, '..', `.prompt.${safeStepId}.tmp`);
        writeFileSync(promptFile, prompt);

        // Save raw input
        if (this.rawLogDir && existsSync(this.rawLogDir)) {
            writeFileSync(resolve(this.rawLogDir, `${simpleId}_${safeStepId}_input.md`), prompt);
        }

        this.log(`[${stepId}] Executing Claude (timeout: ${timeoutSec}s)...`);

        let output = '';
        let success = false;
        let errorMsg: string | undefined;

        try {
            const isWindows = process.platform === 'win32';
            const catCmd = isWindows ? 'type' : 'cat';
            const cmd = `${catCmd} "${promptFile}" | claude -p - --dangerously-skip-permissions`;

            const result = await execAsync(cmd, {
                timeout: timeoutSec * 1000,
                encoding: 'utf-8',
                maxBuffer: 50 * 1024 * 1024,
                shell: undefined
            });

            output = result.stdout;
            success = true;

        } catch (err: any) {
            output = err.stdout || '';
            errorMsg = err.message;
            success = output.length > 50;
        }

        // Save raw output
        if (this.rawLogDir && existsSync(this.rawLogDir)) {
            writeFileSync(
                resolve(this.rawLogDir, `${simpleId}_${safeStepId}_${success ? 'ok' : 'fail'}.md`),
                output + (errorMsg ? `\n\nERROR: ${errorMsg}` : '')
            );
        }

        return { ok: success, output, error: errorMsg };
    }
}
