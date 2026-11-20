const handlers: Array<{ run: () => boolean }> = [];
let dismiss: () => boolean = () => false;

/** Handles platform Back after the keyboard and overlays; return false to leave it to the OS. */
export function on_window_back(handler: () => boolean): () => void {
	const entry = { run: handler };
	handlers.push(entry);
	return () => {
		const index = handlers.indexOf(entry);
		if (index !== -1) handlers.splice(index, 1);
	};
}

export function set_back_dismiss(handler: () => boolean) {
	dismiss = handler;
}

export function handle_back(): boolean {
	if (dismiss()) return true;
	for (const handler of handlers.slice().reverse()) if (handler.run()) return true;
	return false;
}
