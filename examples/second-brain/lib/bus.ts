import { warn } from './log.js';

/**
 * @typedef {{ type: string } & Record<string, any>} BusEvent
 */

export function create_bus() {
	const subscribers = new Set();
	return {
		/** @param {(event: BusEvent) => void} fn @returns {() => void} */
		subscribe(fn) {
			subscribers.add(fn);
			return () => subscribers.delete(fn);
		},
		/** @param {BusEvent} event */
		emit(event) {
			for (const fn of subscribers) {
				try {
					fn(event);
				} catch (err) {
					warn('bus subscriber threw:', err.message);
				}
			}
		}
	};
}
