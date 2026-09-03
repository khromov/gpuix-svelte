import { mount_headless, find_test_id, click_test_id, check, finish } from 'gpuix-svelte/test';
const AuxProbe = (await import('./AuxProbe.svelte')).default;
mount_headless(AuxProbe, { width: 400, height: 300 });
const log = () => find_test_id('log')!.children![0]!.text;
click_test_id('card', { button: 0, modifiers: 'ctrl' });
console.log('ctrl+left ->', log());
check('probe ran', true);
finish('auxprobe');
