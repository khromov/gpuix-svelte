/**
 * The playground page: an editor, the compiler, and one frame per renderer to run the result in.
 * scripts/playground.ts builds it and writes the markup these ids come from.
 */

import type { Mutation } from '../src/types.ts';
import { compile_for, problem_of, type Compiled } from './compile.ts';
import { create_editor } from './editor.ts';
import type { Target } from './modules.ts';
import { decode_hash, encode_hash } from './share.ts';
import { Mirror, batch_html, count_nodes, dom_html, tree_html } from './tree.ts';
import counter from './examples/Counter.svelte?raw';
import list from './examples/List.svelte?raw';
import theme from './examples/Theme.svelte?raw';
import components from './examples/Components.svelte?raw';
import whitespace from './examples/Whitespace.svelte?raw';

const EXAMPLES = [
	{ name: 'Counter', source: counter },
	{ name: 'Keyed list', source: list },
	{ name: 'Theme on both renderers', source: theme },
	{ name: 'Scroller, Tooltip, Popover, Portal', source: components },
	{ name: 'Whitespace in text', source: whitespace }
];

type View = 'result' | 'tree' | 'mutations' | 'js';
type Level = 'error' | 'warn' | 'log';

interface Frame {
	el: HTMLIFrameElement;
	ready: boolean;
	pending: string | null;
	sent: string | null;
}

const KEPT_BATCHES = 60;
const KEPT_MESSAGES = 200;
const BASE = new URL('playground/', location.href).href;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const shared = await decode_hash(location.hash);
const isolated = globalThis.crossOriginIsolated === true;

let target: Target = shared.target ?? (isolated ? 'gpui' : 'dom');
let view: View = 'result';
let compiled: Compiled | null = null;
let run = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let painting = false;
let compiled_status = '';

const frames: Record<Target, Frame> = {
	gpui: { el: el<HTMLIFrameElement>('pg-frame-gpui'), ready: false, pending: null, sent: null },
	dom: { el: el<HTMLIFrameElement>('pg-frame-dom'), ready: false, pending: null, sent: null }
};

const mirror = new Mirror();
let batches: Array<{ index: number; ops: Mutation[] }> = [];
let batch_count = 0;
let dom_tree = '';
let fatal: string | null = null;
let compile_messages: Array<{ level: Level; text: string }> = [];
let run_messages: Array<{ level: Level; text: string }> = [];

const status = el('pg-status');
const notice = el('pg-notice');
const messages = el('pg-messages');
const views: Record<View, HTMLElement> = { result: el('pg-result'), tree: el('pg-tree'), mutations: el('pg-mutations'), js: el('pg-js') };

const select = el<HTMLSelectElement>('pg-example');
if (shared.source !== null) select.add(new Option('Shared code', ''));
EXAMPLES.forEach((example, i) => select.add(new Option(example.name, String(i))));

const editor = create_editor(el('pg-editor'), shared.source ?? EXAMPLES[0].source, () => {
	clearTimeout(timer);
	forget();
	timer = setTimeout(update, 300);
});

select.addEventListener('change', () => {
	const example = EXAMPLES[Number(select.value)];
	if (select.value !== '' && example) editor.set(example.source);
});

function show_messages() {
	const all = [...compile_messages, ...run_messages];
	messages.hidden = all.length === 0;
	messages.innerHTML = all.map((m) => `<div class="pg-message pg-${m.level}">${escape(m.text)}</div>`).join('');
	messages.scrollTop = messages.scrollHeight;
}

function add_run_message(level: Level, text: string) {
	run_messages.push({ level, text });
	if (run_messages.length > KEPT_MESSAGES) run_messages.shift();
	show_messages();
}

function empty(text: string) {
	return `<p class="pg-empty">${escape(text)}</p>`;
}

function paint() {
	painting = false;
	if (view === 'tree') {
		const html = target === 'gpui' ? tree_html(mirror) : dom_tree && dom_html(dom_tree);
		views.tree.innerHTML = html || empty(target === 'gpui' ? 'The element tree appears once the GPUI renderer has mounted the component.' : 'Nothing is mounted yet.');
	} else if (view === 'mutations') {
		if (target === 'dom') {
			views.mutations.innerHTML = empty('Svelte’s DOM renderer writes to the document directly, so there are no batches to show. Switch the renderer to GPUI to see what crosses into native code.');
		} else {
			const pinned = views.mutations.scrollHeight - views.mutations.scrollTop - views.mutations.clientHeight < 40;
			views.mutations.innerHTML = batches.map((b) => batch_html(b.index, b.ops)).join('') || empty('Each applyBatch call the renderer makes is listed here, newest last.');
			if (pinned) views.mutations.scrollTop = views.mutations.scrollHeight;
		}
	}
}

function repaint() {
	if (painting) return;
	painting = true;
	requestAnimationFrame(paint);
}

function show_notice() {
	const text = target !== 'gpui' ? null : fatal !== null ? `The GPUI renderer could not start in this browser: ${fatal}` : !isolated ? 'The GPUI renderer needs a cross-origin isolated page, which this browser did not grant (it takes a service worker over HTTPS or localhost). The DOM renderer runs the same component.' : null;
	notice.hidden = text === null;
	notice.textContent = text ?? '';
	frames.gpui.el.hidden = target !== 'gpui' || text !== null;
	frames.dom.el.hidden = target !== 'dom';
}

function flush(which: Target) {
	const frame = frames[which];
	if (!frame.ready || frame.pending === null) return;
	run_messages = [];
	if (which === 'gpui') {
		batches = [];
		batch_count = 0;
	}
	frame.el.contentWindow?.postMessage({ type: 'run', id: ++run, code: frame.pending }, location.origin);
	frame.sent = frame.pending;
	frame.pending = null;
	show_messages();
}

function send(which: Target, code: string) {
	const frame = frames[which];
	if (which === 'gpui' && (!isolated || fatal !== null)) return;
	if (frame.ready && frame.pending === null && frame.sent === code) return;
	frame.pending = code;
	if (!frame.el.getAttribute('src')) {
		status.textContent = which === 'gpui' ? 'Loading the GPUI renderer (about 20 MB, once)…' : 'Loading…';
		frame.el.src = `${BASE}${which}/index.html`;
	} else if (which === 'dom' && frame.ready) {
		frame.ready = false;
		frame.el.contentWindow?.location.reload();
	} else {
		flush(which);
	}
}

/** The source goes in a link only when one is asked for; the address itself never carries it. */
const link = async () => new URL(await encode_hash(editor.get(), target), location.href).href;

/** A link someone opened stops describing the page once they change it, so it leaves the address. */
function forget() {
	if (!location.hash) return;
	// Not before the service worker's one reload, which has to land on the link that was opened.
	let settled = isolated;
	try {
		settled ||= sessionStorage.getItem('playground-isolating') !== null;
	} catch {
		settled = true;
	}
	if (settled) history.replaceState(null, '', location.pathname + location.search);
}

function update() {
	const source = editor.get();

	const started = performance.now();
	try {
		compiled = compile_for(target, source, BASE);
	} catch (error) {
		const problem = problem_of(error);
		compile_messages = [{ level: 'error', text: problem.line === null ? problem.message : `App.svelte:${problem.line} ${problem.message}` }];
		editor.mark(problem.line);
		status.textContent = 'Not compiled; the result is the last version that was';
		show_messages();
		return;
	}
	editor.mark(null);
	compile_messages = compiled.warnings.map((text) => ({ level: 'warn', text }));
	compiled_status = `Compiled for ${target === 'gpui' ? 'GPUI' : 'the DOM'} in ${Math.max(1, Math.round(performance.now() - started))} ms`;
	status.textContent = compiled_status;

	const code = views.js.querySelector('code')!;
	code.textContent = compiled.code;
	(globalThis as { Prism?: { highlightElement(element: Element): void } }).Prism?.highlightElement(code);

	show_messages();
	show_notice();
	send(target, compiled.runnable);
	repaint();
}

addEventListener('message', (event) => {
	const which = (Object.keys(frames) as Target[]).find((t) => frames[t].el.contentWindow === event.source);
	const data = event.data as { playground?: boolean; type?: string; text?: string; level?: Level | 'info'; ops?: Mutation[]; html?: string } | null;
	if (!which || event.origin !== location.origin || !data?.playground) return;

	switch (data.type) {
		case 'ready':
			frames[which].ready = true;
			flush(which);
			break;
		case 'mounted':
			if (which === target) status.textContent = compiled_status;
			break;
		case 'fatal':
			fatal = data.text ?? 'unknown error';
			status.textContent = 'The GPUI renderer did not start';
			show_notice();
			break;
		case 'error':
			add_run_message('error', data.text ?? 'Unknown error');
			break;
		case 'console':
			add_run_message(data.level === 'info' || !data.level ? 'log' : data.level, data.text ?? '');
			break;
		case 'batch':
			mirror.apply(data.ops ?? []);
			batches.push({ index: ++batch_count, ops: data.ops ?? [] });
			if (batches.length > KEPT_BATCHES) batches.shift();
			el('pg-count').textContent = `${count_nodes(mirror)} native elements`;
			repaint();
			break;
		case 'html':
			dom_tree = data.html ?? '';
			repaint();
			break;
	}
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-target]')) {
	button.setAttribute('aria-pressed', String(button.dataset.target === target));
	button.addEventListener('click', () => {
		target = button.dataset.target as Target;
		for (const other of document.querySelectorAll('[data-target]')) other.setAttribute('aria-pressed', String(other === button));
		el('pg-count').hidden = target !== 'gpui';
		forget();
		update();
	});
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
	button.addEventListener('click', () => {
		view = button.dataset.view as View;
		for (const other of document.querySelectorAll('[data-view]')) other.setAttribute('aria-pressed', String(other === button));
		for (const [name, pane] of Object.entries(views)) pane.hidden = name !== view;
		paint();
	});
}

const share = el<HTMLButtonElement>('pg-share');
if (navigator.clipboard) {
	share.hidden = false;
	share.addEventListener('click', () => {
		clearTimeout(timer);
		const url = link();
		update();
		// Safari forgets the click across an await, so the link is awaited inside the clipboard write.
		const written = typeof ClipboardItem === 'function' ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': url.then((text) => new Blob([text], { type: 'text/plain' })) })]) : Promise.reject();
		written
			.catch(() => url.then((text) => navigator.clipboard.writeText(text)))
			.then(
				() => (share.textContent = 'Link copied'),
				() => (share.textContent = 'Copy failed')
			);
		setTimeout(() => (share.textContent = 'Copy link'), 1500);
	});
}

el('pg-count').hidden = target !== 'gpui';
update();
