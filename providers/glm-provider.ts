/**
 * GLM-4.7 Provider - uses Z.ai API
 */
import { LLMProvider } from './base-provider.js';
import type { LogFunction } from '../types.js';

interface ZaiApiResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
    error?: {
        message?: string;
        code?: string;
    };
}

export class GlmProvider implements LLMProvider {
    private apiKey: string;
    private apiUrl: string;
    private model: string;

    constructor(
        private log: LogFunction,
        private logErr: LogFunction,
        private dryRun: boolean,
        private mockMode: boolean,
        private rawLogDir?: string
    ) {
        this.apiKey = process.env.ZAI_API_KEY || '';
        this.apiUrl = process.env.ZAI_API_URL || 'https://api.z.ai/api/paas/v4/chat/completions';
        this.model = process.env.ZAI_MODEL || 'glm-4.7';

        if (!this.apiKey && !dryRun && !mockMode) {
            this.logErr('Warning: ZAI_API_KEY not set. GLM provider may fail.');
        }
    }

    async execute(
        prompt: string,
        timeoutSec: number,
        stepId: string
    ): Promise<{ ok: boolean; output: string; error?: string }> {
        if (this.dryRun) {
            this.log(`[DRY-RUN] [${stepId}] Would execute GLM-4.7 with prompt`);
            return { ok: true, output: '[dry-run output]' };
        }

        if (this.mockMode) {
            this.log(`[MOCK] [${stepId}] Simulating GLM-4.7 (2s delay)...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return { ok: true, output: '===NEXT_STEP_READY===\nMock successful.' };
        }

        const simpleId = new Date().toISOString().slice(11, 19).replace(/:/g, '');
        const safeStepId = stepId.replace(/[^a-zA-Z0-9-]/g, '_');

        // Save raw input
        if (this.rawLogDir) {
            try {
                const { writeFileSync } = await import('fs');
                const { resolve, existsSync } = await import('path');
                if (existsSync(this.rawLogDir)) {
                    writeFileSync(resolve(this.rawLogDir, `${simpleId}_${safeStepId}_input.md`), prompt);
                }
            } catch (err) {
                // Ignore logging errors
            }
        }

        this.log(`[${stepId}] Executing GLM-4.7 via Z.ai API (timeout: ${timeoutSec}s)...`);

        let output = '';
        let success = false;
        let errorMsg: string | undefined;

        try {
            // Calculate max tokens (output limit)
            const maxTokens = parseInt(process.env.ZAI_MAX_TOKENS || '128000');

            const requestBody = {
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: maxTokens,
                temperature: 0.7,
                stream: false
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData: ZaiApiResponse = await response.json().catch(() => ({}));
                throw new Error(
                    `HTTP ${response.status}: ${errorData.error?.message || response.statusText}`
                );
            }

            const data: ZaiApiResponse = await response.json();

            if (data.error) {
                throw new Error(data.error.message || 'Unknown API error');
            }

            if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
                output = data.choices[0].message.content;
                success = true;
            } else {
                throw new Error('No content in API response');
            }

        } catch (err: any) {
            errorMsg = err.message || 'Unknown error';
            if (err.name === 'AbortError') {
                errorMsg = `Request timeout after ${timeoutSec}s`;
            }
            success = false;
            this.logErr(`[${stepId}] GLM API error: ${errorMsg}`);
        }

        // Save raw output
        if (this.rawLogDir) {
            try {
                const { writeFileSync } = await import('fs');
                const { resolve, existsSync } = await import('path');
                if (existsSync(this.rawLogDir)) {
                    writeFileSync(
                        resolve(this.rawLogDir, `${simpleId}_${safeStepId}_${success ? 'ok' : 'fail'}.md`),
                        output + (errorMsg ? `\n\nERROR: ${errorMsg}` : '')
                    );
                }
            } catch (err) {
                // Ignore logging errors
            }
        }

        return { ok: success, output, error: errorMsg };
    }
}
