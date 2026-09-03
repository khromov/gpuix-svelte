import { warn } from './log.ts';
import type { MlStatus } from './ml-client.ts';
import type { SettingKey } from './settings.ts';
import type { Status } from './store.ts';

export interface ItemEvent {
	type: 'item';
	id: number;
	status?: Status | 'deleted';
	step?: string;
	progress?: number | null;
	text?: string;
	error?: string;
	added?: boolean;
	updated?: boolean;
}

export interface QueueEvent {
	type: 'queue';
	pending: number;
	active: number;
	done: number;
	failed: number;
	active_ids: number[];
}

/** A feed row changed; `null` when the list itself did. */
export interface FeedEvent {
	type: 'feed';
	id: number | null;
}

export type BusEvent =
	| ItemEvent
	| QueueEvent
	| FeedEvent
	| { type: 'ml'; status: MlStatus }
	| { type: 'settings'; key: SettingKey; value: unknown };

export type Bus = ReturnType<typeof create_bus>;

export function create_bus() {
	const subscribers = new Set<(event: BusEvent) => void>();
	return {
		subscribe(fn: (event: BusEvent) => void): () => void {
			subscribers.add(fn);
			return () => subscribers.delete(fn);
		},
		emit(event: BusEvent) {
			for (const fn of subscribers) {
				try {
					fn(event);
				} catch (err) {
					warn('bus subscriber threw:', (err as Error).message);
				}
			}
		}
	};
}
