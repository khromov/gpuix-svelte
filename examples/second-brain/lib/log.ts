export const log = (...args: unknown[]) => console.log('[substrate]', ...args);
export const warn = (...args: unknown[]) => console.warn('[substrate]', ...args);
export const error = (...args: unknown[]) => console.error('[substrate]', ...args);

export const DEBUG = process.env.GPUIX_BRAIN_DEBUG === '1';
export const debug = DEBUG ? log : () => {};
