/**
 * gpuix-svelte-ui: one set of components for a GPUI window and a browser DOM. The components resolve
 * through the package's own exports rather than relative paths, because the published JavaScript of
 * this file lives in lib/ while the .svelte sources stay under src/.
 */

export { default as Avatar } from 'gpuix-svelte-ui/components/Avatar.svelte';
export { default as Badge } from 'gpuix-svelte-ui/components/Badge.svelte';
export { default as Button } from 'gpuix-svelte-ui/components/Button.svelte';
export { default as Card } from 'gpuix-svelte-ui/components/Card.svelte';
export { default as Checkbox } from 'gpuix-svelte-ui/components/Checkbox.svelte';
export { default as Dialog } from 'gpuix-svelte-ui/components/Dialog.svelte';
export { default as Icon } from 'gpuix-svelte-ui/components/Icon.svelte';
export { default as Kbd } from 'gpuix-svelte-ui/components/Kbd.svelte';
export { default as Link } from 'gpuix-svelte-ui/components/Link.svelte';
export { default as Menu } from 'gpuix-svelte-ui/components/Menu.svelte';
export { default as Progress } from 'gpuix-svelte-ui/components/Progress.svelte';
export { default as RadioGroup } from 'gpuix-svelte-ui/components/RadioGroup.svelte';
export { default as Router } from 'gpuix-svelte-ui/components/Router.svelte';
export { default as Select } from 'gpuix-svelte-ui/components/Select.svelte';
export { default as Separator } from 'gpuix-svelte-ui/components/Separator.svelte';
export { default as Skeleton } from 'gpuix-svelte-ui/components/Skeleton.svelte';
export { default as Slider } from 'gpuix-svelte-ui/components/Slider.svelte';
export { default as Spinner } from 'gpuix-svelte-ui/components/Spinner.svelte';
export { default as Stack } from 'gpuix-svelte-ui/components/Stack.svelte';
export { default as Tabs } from 'gpuix-svelte-ui/components/Tabs.svelte';
export { default as TextArea } from 'gpuix-svelte-ui/components/TextArea.svelte';
export { default as TextField } from 'gpuix-svelte-ui/components/TextField.svelte';
export { default as Toaster } from 'gpuix-svelte-ui/components/Toaster.svelte';
export { default as Toggle } from 'gpuix-svelte-ui/components/Toggle.svelte';

// gpuix-svelte's own components, so an app needs one import for all of them.
export { default as Popover } from 'gpuix-svelte/components/Popover.svelte';
export { default as Portal } from 'gpuix-svelte/components/Portal.svelte';
export { default as Scroller } from 'gpuix-svelte/components/Scroller.svelte';
export { default as Tooltip } from 'gpuix-svelte/components/Tooltip.svelte';

export { apply_theme, theme, theme_vars, theme_rule, DARK, LIGHT, type Palette } from './theme.ts';
export { toast, dismiss_toast, clear_toasts, toasts, type ToastOptions, type ToastItem } from './toast.ts';
export { router, navigate, back, forward, before, after, href, screen, lazy, match, resolve, to_url, start_router, stop_router } from './router.ts';
export type { Route, RouteProps, RouteTable, Screen, LazyScreen, Params, Mode, NavigateOptions, Hook, AfterHook, Verdict } from './router.ts';
export { key_of, activates, chorded, repeats, type KeyLike } from './keys.ts';
export { own_hitbox, test_id, aria_checked, aria_disabled, bounds_of, focus_node, holds_focus, pointer_x, still_pressed, drag_handlers, MONO, BREAKPOINTS, min_width, max_width } from './shared.ts';
export type { Tone, Option, MenuEntry, Box, Breakpoint } from './shared.ts';
export { ICONS, type IconName } from './icons.ts';
