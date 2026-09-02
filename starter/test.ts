import { mount_headless, click_test_id, all_text, check, finish } from 'gpuix-svelte/test';
import App from './App.svelte';

mount_headless(App, { width: 400, height: 300 });

click_test_id('plus');
click_test_id('plus');
click_test_id('minus');

check('the buttons reached the counter', all_text().includes('1'));
finish('starter');
