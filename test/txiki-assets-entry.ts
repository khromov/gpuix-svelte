import { render } from 'gpuix-svelte';
import App from './TxikiAsset.svelte';

render(App, { app: { update: { manifest: 'https://example.com/update.json' } } });
