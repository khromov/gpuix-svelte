const env = globalThis.process?.env ?? {};
const paths = (globalThis as unknown as { gpuixHost?: { paths?: { data?: string; temp?: string } } }).gpuixHost?.paths ?? {};
export const homedir = () => env.HOME ?? env.USERPROFILE ?? paths.data ?? '';
export const tmpdir = () => paths.temp || env.TMPDIR || env.TEMP || env.TMP || '';
export const platform = () => globalThis.process?.platform ?? 'unknown';
export const arch = () => globalThis.process?.arch ?? 'unknown';
export const EOL = '\n';
export default { homedir, tmpdir, platform, arch, EOL };
