// Each entry is a tag GPUI draws with no look of its own, and what takes the browser's look off it.
const RULES: Record<string, string> = {
	button: 'display:block;margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;text-align:inherit;appearance:none'
};

/** `:where()` has no specificity, so every rule of the app's outranks the reset. */
export const RESET_CSS = Object.entries(RULES)
	.map(([selector, declarations]) => `:where(${selector}){${declarations}}`)
	.join('');
