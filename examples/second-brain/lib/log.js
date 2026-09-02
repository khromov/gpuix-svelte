export const log = (...args) => console.log('[substrate]', ...args);
export const warn = (...args) => console.warn('[substrate]', ...args);
export const error = (...args) => console.error('[substrate]', ...args);

export const DEBUG = process.env.GPUIX_BRAIN_DEBUG === '1';
export const debug = DEBUG ? log : () => {};
