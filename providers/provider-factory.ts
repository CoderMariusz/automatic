/**
 * Factory for creating LLM providers
 */
import { LLMProvider, ProviderType } from './base-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { GlmProvider } from './glm-provider.js';
import type { LogFunction } from '../types.js';

export function createProvider(
    type: ProviderType,
    log: LogFunction,
    logErr: LogFunction,
    dryRun: boolean,
    mockMode: boolean,
    rawLogDir?: string
): LLMProvider {
    switch (type) {
        case 'claude':
            return new ClaudeProvider(log, logErr, dryRun, mockMode, rawLogDir);
        case 'glm':
            return new GlmProvider(log, logErr, dryRun, mockMode, rawLogDir);
        default:
            throw new Error(`Unknown provider type: ${type}`);
    }
}
