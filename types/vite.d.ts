// Vite's `?raw` suffix, which the docs' playground uses to read its example components as text.
declare module '*?raw' {
	const text: string;
	export default text;
}
