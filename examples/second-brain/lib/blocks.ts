/**
 * Top-level markdown blocks as raw source, one per row of a virtual list: a native
 * `<markdown>` lays out its whole document every frame, so a long page is rendered
 * as many short ones instead.
 */

import { lexer } from 'marked';

export function markdown_blocks(body: string): string[] {
	const blocks: string[] = [];
	for (const token of lexer(body ?? '', { gfm: true })) {
		const raw = token.raw.trim();
		if (raw) blocks.push(raw);
	}
	return blocks;
}
