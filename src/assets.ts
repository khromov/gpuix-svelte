/** Resolves a project-relative resource copied by the mobile build; desktop keeps the path unchanged. */
export function asset_path(path: string): string {
	if (!path || path.startsWith('/') || path.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) {
		throw new TypeError('asset_path requires a project-relative path');
	}
	const host = (globalThis as typeof globalThis & { gpuixHost?: { assetPath?: (name: string) => string } }).gpuixHost;
	return host?.assetPath ? host.assetPath(`gpuix-resources/${path}`) : path;
}
