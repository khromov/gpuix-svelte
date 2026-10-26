/**
 * The family a TrueType/OpenType file declares, so the demo can name the font it just
 * registered: the typographic family (name ID 16) when present, else the legacy one (1).
 */
export function font_family(bytes: Uint8Array): string | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

	// A collection's first font stands for the file.
	const base = tag(0) === 'ttcf' ? view.getUint32(12) : 0;
	const tables = view.getUint16(base + 4);

	for (let i = 0; i < tables; i++) {
		const record = base + 12 + i * 16;
		if (tag(record) !== 'name') continue;

		const table = view.getUint32(record + 8);
		const count = view.getUint16(table + 2);
		const strings = table + view.getUint16(table + 4);
		const found = new Map<number, string>();

		for (let j = 0; j < count; j++) {
			const entry = table + 6 + j * 12;
			const platform = view.getUint16(entry);
			const id = view.getUint16(entry + 6);
			if ((id !== 1 && id !== 16) || found.has(id)) continue;

			const start = strings + view.getUint16(entry + 10);
			const raw = bytes.subarray(start, start + view.getUint16(entry + 8));
			// Unicode and Windows names are UTF-16BE; Macintosh ones are single-byte.
			found.set(id, platform === 1 ? String.fromCharCode(...raw) : new TextDecoder('utf-16be').decode(raw));
		}
		return found.get(16) ?? found.get(1) ?? null;
	}
	return null;
}
