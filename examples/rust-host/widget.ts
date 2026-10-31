/**
 * The sidecar entry the Rust host spawns (`SlotOptions::bun` in src/main.rs). It never
 * opens a window: `embed()` mounts into the slot the host painted it in.
 */

import { embed } from 'gpuix-svelte/embed';
import Widget from './Widget.svelte';

embed(Widget);
