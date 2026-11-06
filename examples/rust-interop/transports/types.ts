export interface Transport {
	/** JS → Rust, answered by Rust: a string when the call itself is the round trip. */
	send(msg: string): string | Promise<string>;
	/** Rust → JS: what Rust sends on its own (here, a tick a second). */
	subscribe(on_event: (event: string) => void): void;
	close(): void;
}

export interface TransportKind {
	id: string;
	name: string;
	/** How the two sides reach each other. */
	mechanism: string;
	/** How a Rust-initiated message reaches JS. */
	push: string;
	create(): Promise<Transport>;
}
