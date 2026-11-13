import { pathToFileURL } from 'node:url';
import type { Component } from 'svelte';
import { render } from 'gpuix-svelte';
import Frame from './Frame.svelte';

// One of docs/ui.md's samples in a window, framed as the docs page frames its live demo; scripts/shots.ts writes the sample out and opens it here.
const shot = process.env.GPUIX_UI_SHOT;
if (!shot) throw new Error('[ui-shot] run through `npm run shots -- --only ui`, which sets GPUIX_UI_SHOT');
const { source, width, height } = JSON.parse(shot) as { source: string; width: number; height: number };
const Demo = ((await import(pathToFileURL(source).href)) as { default: Component }).default;

render(Frame, { title: 'gpuix-svelte-ui', width, height, props: { Demo } });
