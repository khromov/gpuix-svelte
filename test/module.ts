/**
 * A `.svelte.ts` module is where Svelte 5 keeps shared runes state. The loaders
 * have to compile it, and it has to be the same instance for the component that
 * renders it and the code that imports it directly.
 */

import { mount_headless, settle, click_text, all_text, check, finish } from 'gpuix-svelte/test';
import { store, bump } from './ModuleStore.svelte.ts';

const ModuleUser = (await import('./ModuleUser.svelte')).default;
mount_headless(ModuleUser);

check('initial render reads the module state', all_text().includes('count is 0'), true);

click_text('bump');
check('a click through the component updates the painted text', all_text().includes('count is 1'), true);
check('the test sees the same module instance', store.count, 1);

bump();
settle();
check('a direct mutation re-renders the component', all_text().includes('count is 2'), true);

finish('module');
