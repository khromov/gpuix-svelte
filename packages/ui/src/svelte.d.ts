// For the lib emit (tsconfig.lib.json), which cannot take the repository's types/ without pulling the
// root package in by its real path; the barrel re-exports .svelte modules and needs them declared.
declare module '*.svelte' {
	const component: import('gpuix-svelte').AnyComponent;
	export default component;
}
