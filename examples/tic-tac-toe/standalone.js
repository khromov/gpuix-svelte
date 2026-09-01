// `render_hot` re-imports the component from disk on every save, and a binary
// has no source on disk, so the compiled entry mounts it through a static import.
import { render } from 'gpuix-svelte';
import TicTacToe from './TicTacToe.svelte';

render(TicTacToe, {
	title: 'GPUIX + Svelte — Tic-tac-toe',
	width: 480,
	height: 640
});
