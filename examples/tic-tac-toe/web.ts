/**
 * The browser entry. The same two calls as `standalone.ts`, except that the window
 * options are inert here: the wasm renderer ignores them and sizes its canvas to
 * the page instead.
 */

import { render } from 'gpuix-svelte';
import TicTacToe from './TicTacToe.svelte';

render(TicTacToe, { title: 'GPUIX + Svelte — Tic-tac-toe', width: 480, height: 640 });
