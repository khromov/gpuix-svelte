/**
 * What each surface offers on a right click. Kept apart from the components so the
 * wiring of an action lives in one place and a route stays a route.
 */

import type { App } from './app.ts';
import type { Source } from './ask.ts';
import { capture, pick_audio, pick_images, paste_image, playback, start_recording, submit, toggle_play } from './capture.svelte.ts';
import { chat, clear as clear_chat, send } from './chat.svelte.ts';
import { read_text, write_text } from './clipboard.ts';
import type { ChatMessage } from './chat.svelte.ts';
import { data, display_title, get_app, item_by_id } from './data.svelte.ts';
import { choose_save_path } from './dialogs.ts';
import { back, push, route } from './router.svelte.ts';
import { open_path, open_url } from './shell.ts';
import type { Feed, Item, Kind } from './store.ts';
import { set_mode, theme, type ThemeMode } from './theme.svelte.ts';
import { focus, toast, type MenuEntry } from './ui.svelte.ts';

type Maybe = MenuEntry | false | 0 | null | undefined | '';

const menu = (...entries: Maybe[]): MenuEntry[] => entries.filter((entry): entry is MenuEntry => !!entry);

const copy = (text: string, what = 'Copied') => void write_text(text).then((ok) => toast(ok ? what : 'Could not reach the clipboard', ok ? 'info' : 'error'));

async function attempt(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (err) {
		toast((err as Error).message, 'error');
	}
}

/** The database is the only copy, so there is nothing on disk to reveal — save one out instead. */
export async function export_item(item: Item) {
	const app = get_app();
	const blob = app.blobs.info(item.file_blob!);
	if (!blob) throw new Error('no file on this item');
	const suggested = item.meta.original_name?.replace(/\.[^.]+$/, '') || item.title || `substrate-${item.id}`;
	const dest = await choose_save_path(`${suggested}.${blob.ext}`);
	if (!dest) return;
	await Bun.write(dest, app.blobs.bytes(blob.id)!);
	toast(`Exported to ${dest}`);
}

export function item_actions(item: Item, { on_item = false }: { on_item?: boolean } = {}): MenuEntry[] {
	const app = get_app();
	const url = item.source_url;
	const llm = data.capabilities?.llm?.ok ?? false;
	const vision = llm && !!app.settings.get('llm.visionModel');
	const feed = item.feed_id == null ? null : (data.feeds.find((f) => f.id === item.feed_id) ?? null);
	const playing = playback.id === item.id;

	return menu(
		!on_item && { label: 'Open', icon: 'eye', run: () => push(`/item/${item.id}`) },
		url && { label: 'Open in browser', icon: 'external', run: () => open_url(url) },
		item.kind === 'audio' && item.file_blob && { label: playing ? 'Stop' : 'Play', icon: playing ? 'stop' : 'play', run: () => toggle_play(item) },
		{ label: 'Edit', icon: 'edit', run: () => push(`/item/${item.id}?edit=1`) },
		'separator',
		item.body && { label: 'Copy text', icon: 'copy', run: () => copy(item.body) },
		url && { label: 'Copy address', icon: 'link', run: () => copy(url, 'Address copied') },
		item.file_blob && { label: 'Export…', icon: 'folder', run: () => attempt(() => export_item(item)) },
		'separator',
		llm && item.body && { label: 'Summarize', icon: 'sparkles', run: () => attempt(() => app.summarize(item.id)) },
		item.kind === 'image' && vision && { label: 'Describe with LLM', icon: 'sparkles', run: () => attempt(() => app.describe_image(item.id)) },
		url && item.kind === 'link' && { label: 'Re-read page', icon: 'refresh', run: () => { app.rescrape(item.id); toast('Reading the page again'); } },
		item.status === 'error' && { label: 'Retry', icon: 'refresh', run: () => app.retry(item.id) },
		feed && { label: `Show ${feed.title || 'the feed'}`, icon: 'rss', run: () => push('/feeds') },
		'separator',
		{
			label: 'Delete',
			icon: 'trash',
			danger: true,
			confirm: { title: 'Delete this item?', body: display_title(item), confirmLabel: 'Delete' },
			run: () => {
				app.delete_item(item.id);
				if (on_item || route.path === `/item/${item.id}`) back();
				toast('Deleted');
			}
		}
	);
}

export function feed_actions(feed: Feed, { on_options = null }: { on_options?: (() => void) | null } = {}): MenuEntry[] {
	const app = get_app();
	const kept = data.feed_counts[feed.id] ?? 0;

	return menu(
		{ label: 'Refresh now', icon: 'refresh', run: () => refresh_feed(app, feed) },
		feed.site_url && { label: 'Open site', icon: 'external', run: () => open_url(feed.site_url!) },
		{ label: 'Search this feed', icon: 'search', run: () => push(`/search?q=${encodeURIComponent(`feeds:on ${feed.title}`)}`) },
		'separator',
		{ label: feed.enabled ? 'Pause polling' : 'Resume polling', icon: 'rss', run: () => app.feeds.update(feed.id, { enabled: !feed.enabled }) },
		{ label: 'Fetch the full article', icon: 'check', hint: feed.full_text ? 'on' : 'off', run: () => app.feeds.update(feed.id, { full_text: !feed.full_text }) },
		on_options && { label: 'Options…', icon: 'settings', run: on_options },
		{ label: 'Copy feed address', icon: 'link', run: () => copy(feed.url, 'Address copied') },
		'separator',
		{
			label: 'Unsubscribe',
			icon: 'trash',
			danger: true,
			confirm: {
				title: `Unsubscribe from ${feed.title || feed.url}?`,
				body: `Polling stops. The ${kept} item${kept === 1 ? '' : 's'} it already brought in stay in your library.`,
				confirmLabel: 'Unsubscribe'
			},
			run: () => {
				app.feeds.remove(feed.id, { keep_items: true });
				toast(`Unsubscribed from ${feed.title || feed.url} — its items stay in the library`);
			}
		}
	);
}

async function refresh_feed(app: App, feed: Feed) {
	try {
		const result = await app.feeds.refresh(feed.id);
		toast(result.added ? `${result.added} new from ${feed.title || feed.url}` : 'Nothing new', result.added ? 'success' : 'info');
	} catch (err) {
		toast((err as Error).message, 'error');
	}
}

export function capture_actions(): MenuEntry[] {
	const caps = data.capabilities;

	return menu(
		{ label: 'New note', icon: 'plus', run: () => go_capture() },
		{ label: 'Paste from clipboard', icon: 'paste', run: () => paste_capture() },
		{ label: 'Paste image', icon: 'image', disabled: caps ? !caps.clipboardImage.ok : false, run: paste_image },
		'separator',
		{ label: 'Add image…', icon: 'image', disabled: caps ? !caps.filePicker.ok : false, run: pick_images },
		{ label: 'Import audio…', icon: 'audio', disabled: caps ? !caps.filePicker.ok : false, run: pick_audio },
		!capture.recording && { label: 'Record', icon: 'mic', disabled: caps ? !caps.recorder.ok : false, run: start_recording }
	);
}

/** The capture box only exists on Everything, so getting there comes first. */
function go_capture() {
	if (route.path !== '/') push('/');
	setTimeout(() => focus('capture'), 30);
}

async function paste_capture() {
	const text = (await read_text()).trim();
	if (!text) return toast('Nothing on the clipboard', 'error');
	capture.text = text;
	await submit();
}

const KIND_LABEL: Record<Kind, string> = { text: 'notes', link: 'links', image: 'images', audio: 'recordings' };
const KIND_WORD: Record<Kind, string> = { text: 'note', link: 'link', image: 'image', audio: 'audio' };

export function nav_actions(path: string, kind: Kind | null): MenuEntry[] {
	const app = get_app();

	return menu(
		route.path !== path && { label: 'Open', icon: 'eye', run: () => push(path) },
		kind && { label: `Search only ${KIND_LABEL[kind]}`, icon: 'search', run: () => push(`/search?q=kind:${KIND_WORD[kind]}`) },
		path === '/' && { label: 'New note', icon: 'plus', run: () => go_capture() },
		path === '/feeds' && { label: 'Refresh all feeds', icon: 'refresh', run: () => attempt(async () => toast(`${await app.feeds.refresh_all()} new item(s)`)) },
		path === '/ask' && chat.messages.length > 0 && { label: 'Clear conversation', icon: 'x', run: clear_chat }
	);
}

const MODES: Array<[ThemeMode, string]> = [
	['light', 'Light'],
	['dark', 'Dark'],
	['system', 'Follow system']
];

export function brand_actions(): MenuEntry[] {
	return menu(
		route.path !== '/' && { label: 'Open Everything', icon: 'inbox', run: () => push('/') },
		'separator',
		...MODES.map(([mode, label]) => ({ label, icon: mode === 'system' ? ('monitor' as const) : mode === 'light' ? ('sun' as const) : ('moon' as const), hint: theme.mode === mode ? '✓' : undefined, run: () => set_mode(mode) })),
		'separator',
		{ label: 'Open data folder', icon: 'folder', run: () => open_path(get_app().dirs.root) },
		{ label: 'Settings', icon: 'settings', run: () => push('/settings') }
	);
}

export function status_actions(): MenuEntry[] {
	const app = get_app();
	const stuck = app.stuck_count();

	return menu(
		{ label: 'Open model settings', icon: 'settings', run: () => push('/settings') },
		'separator',
		stuck > 0 && { label: 'Requeue stuck jobs', icon: 'refresh', hint: String(stuck), run: () => toast(`${app.requeue()} job(s) requeued`) },
		{ label: 'Retry everything that failed', icon: 'refresh', run: () => toast(`${app.retry_failed()} item(s) queued`) },
		{
			label: 'Reindex everything',
			icon: 'sparkles',
			confirm: { title: 'Reindex everything?', body: 'Every item is chunked and embedded again. Nothing is lost, but it takes a while.', confirmLabel: 'Reindex' },
			run: () => toast(`${app.reindex()} item(s) queued`)
		}
	);
}

export function message_actions(message: ChatMessage): MenuEntry[] {
	const at = chat.messages.indexOf(message);
	const question = message.role === 'user' ? message : chat.messages.slice(0, at).reverse().find((m) => m.role === 'user');

	return menu(
		message.content && { label: message.role === 'user' ? 'Copy question' : 'Copy answer', icon: 'copy', run: () => copy(message.content) },
		question && question !== message && { label: 'Copy question', icon: 'copy', run: () => copy(question.content) },
		question && !chat.streaming && { label: 'Ask again', icon: 'refresh', run: () => void send(question.content) },
		'separator',
		{ label: 'Clear conversation', icon: 'x', danger: true, run: clear_chat }
	);
}

export function source_actions(source: Source): MenuEntry[] {
	const url = item_by_id(source.item_id)?.source_url ?? null;

	return menu(
		{ label: 'Open item', icon: 'eye', run: () => push(`/item/${source.item_id}`) },
		url && { label: 'Open in browser', icon: 'external', run: () => open_url(url) },
		{ label: 'Copy title', icon: 'copy', run: () => copy(source.title) },
		url && { label: 'Copy address', icon: 'link', run: () => copy(url, 'Address copied') }
	);
}
