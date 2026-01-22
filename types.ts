/**
 * Type definitions for runner
 */
export type LogFunction = (msg: string) => void;

/**
 * Polling configuration for LLM provider calls
 * Controls progress indicator behavior during long-running requests
 */
export interface PollingConfig {
    /** Interval between progress updates in milliseconds (default: 10000 = 10s) */
    intervalMs: number;
    /** Whether to show progress updates */
    showProgress: boolean;
}

/**
 * Default polling configuration
 */
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
    intervalMs: 10000, // 10 seconds
    showProgress: true
};

/**
 * Format elapsed time as human-readable string
 */
export function formatElapsed(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSec = seconds % 60;
    return `${minutes}m ${remainingSec}s`;
}
