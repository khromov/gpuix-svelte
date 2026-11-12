/**
 * GPUI's `click` is the primary button alone, so a right click only arrives if
 * `auxClick` is registered. Ctrl+left stays a plain `click`, which is why an app
 * that wants the macOS secondary click has to look at the modifiers itself.
 */

import { to_gpui_event } from '../src/events.ts';
import { mount_headless, find_test_id, click_test_id, center, text_content, check, finish } from 'gpuix-svelte/test';

const AuxClick = (await import('./AuxClick.svelte')).default;
mount_headless(AuxClick, { width: 400, height: 300 });

const log = () => text_content(find_test_id('log')!);
const at = () => /at=(\d+),(\d+)/.exec(log());

const card_events = find_test_id('card')!.events;
check('the card listens for both', [card_events?.includes('click'), card_events?.includes('auxClick')], [true, true]);
// Svelte hands over whatever the author wrote; a name GPUI has no event for must be
// dropped rather than registered under its own spelling.
check('auxclick maps to GPUI\'s spelling', to_gpui_event('auxclick'), 'auxClick');
check('and an event GPUI does not have maps to null', to_gpui_event('mouseover'), null);

click_test_id('card');
check('a left click is a click', log().startsWith('click right=false'));

// Before the click, since the log's width below it resizes the card.
const aimed_at = center(find_test_id('card')!);
click_test_id('card', { button: 2 });
check('a right click is an auxClick', log().startsWith('auxClick right=true'));
const [got_x, got_y] = at()?.slice(1).map(Number) ?? [-1, -1];
check('carrying the position it happened at', [Math.abs(got_x - aimed_at.x) <= 1, Math.abs(got_y - aimed_at.y) <= 1], [true, true]);

click_test_id('card', { button: 1 });
check('a middle click is an auxClick that is not a right click', log().startsWith('auxClick right=false'));

click_test_id('card', { button: 0, modifiers: 'ctrl' });
check('ctrl+left stays a click, and says so', log().startsWith('click right=false ctrl=true'));

click_test_id('badge', { button: 2 });
check('hitbox="self" passes a right click through a shielded child', log().startsWith('auxClick right=true'));

click_test_id('inner', { button: 2 });
check("a child with its own listener keeps the right click", log(), 'inner aux');

finish('auxclick', 10);
