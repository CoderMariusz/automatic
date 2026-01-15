/**
 * Base interface for LLM providers
 */
export interface LLMProvider {
    /**
     * Execute a prompt and return the response
     * @param prompt - The prompt to send
     * @param timeoutSec - Timeout in seconds
     * @param stepId - Step identifier for logging
     * @returns Result with ok status, output, and optional error
     */
    execute(prompt: string, timeoutSec: number, stepId: string): Promise<{
        ok: boolean;
        output: string;
        error?: string;
    }>;
}

/**
 * Provider type identifier
 */
export type ProviderType = 'claude' | 'glm';
