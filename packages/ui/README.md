# gpuix-svelte-ui

A UI toolkit for [gpuix-svelte](https://github.com/khromov/gpuix-svelte): one set of Svelte
components for a native GPUI window and a browser DOM (Vite, SvelteKit). Buttons, fields, choices,
menus, dialogs, toasts, layout and feedback pieces, and the theme behind them.

```sh
npm install gpuix-svelte gpuix-svelte-ui
```

```svelte
<script>
  import { Button, Card, apply_theme } from 'gpuix-svelte-ui';

  $effect(() => apply_theme('dark'));
</script>

<Card title="Hello">
  <Button variant="primary" onclick={() => console.log('clicked')}>Click me</Button>
</Card>
```

The documentation, with every component running live, is at
[gpuix-svelte.stanislav.garden/ui.html](https://gpuix-svelte.stanislav.garden/ui.html). The
components resolve through the package's own exports, so `gpuix-svelte-ui/components/Button.svelte`
is the same file as `Button` from the barrel.

In the repository, `npm run demo:ui` opens the showcase in a GPUI window and `npm run demo:ui-dom`
serves it as a page; `test/ui.ts` and `test/ui-dom.ts` click through it on each renderer.
