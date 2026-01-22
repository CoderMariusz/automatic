/**
 * GLM-4.7 Provider - uses Z.ai API with progress polling
 */
import { LLMProvider } from './base-provider.js';
import type { LogFunction, PollingConfig } from '../types.js';
import { DEFAULT_POLLING_CONFIG, formatElapsed } from '../types.js';

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
    private pollingConfig: PollingConfig;

    constructor(
        private log: LogFunction,
        private logErr: LogFunction,
        private dryRun: boolean,
        private mockMode: boolean,
        private rawLogDir?: string,
        pollingConfig?: Partial<PollingConfig>
    ) {
        this.apiKey = process.env.ZAI_API_KEY || '';
        this.apiUrl = process.env.ZAI_API_URL || 'https://api.z.ai/api/paas/v4/chat/completions';
        this.model = process.env.ZAI_MODEL || 'glm-4.7';
        this.pollingConfig = { ...DEFAULT_POLLING_CONFIG, ...pollingConfig };

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
                const { writeFileSync, existsSync } = await import('fs');
                const { resolve } = await import('path');
                if (existsSync(this.rawLogDir)) {
                    writeFileSync(resolve(this.rawLogDir, `${simpleId}_${safeStepId}_input.md`), prompt);
                }
            } catch (err) {
                // Ignore logging errors
            }
        }

        this.log(`[${stepId}] Starting GLM-4.7 via Z.ai API (timeout: ${timeoutSec}s, polling: ${this.pollingConfig.intervalMs / 1000}s)...`);

        let output = '';
        let success = false;
        let errorMsg: string | undefined;

        const startTime = Date.now();

        // Set up progress indicator that runs while waiting
        let progressInterval: NodeJS.Timeout | null = null;
        if (this.pollingConfig.showProgress) {
            progressInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                this.log(`[${stepId}] Still waiting for GLM-4.7... ${formatElapsed(elapsed)} elapsed`);
            }, this.pollingConfig.intervalMs);
        }

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
                const elapsed = Date.now() - startTime;
                this.log(`[${stepId}] GLM-4.7 responded after ${formatElapsed(elapsed)}`);
            } else {
                throw new Error('No content in API response');
            }

        } catch (err: any) {
            errorMsg = err.message || 'Unknown error';
            if (err.name === 'AbortError') {
                const elapsed = Date.now() - startTime;
                errorMsg = `Request timeout after ${formatElapsed(elapsed)}`;
            }
            success = false;
            this.logErr(`[${stepId}] GLM API error: ${errorMsg}`);
        } finally {
            // Clear progress interval
            if (progressInterval) {
                clearInterval(progressInterval);
            }
        }

        // Save raw output
        if (this.rawLogDir) {
            try {
                const { writeFileSync, existsSync } = await import('fs');
                const { resolve } = await import('path');
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
