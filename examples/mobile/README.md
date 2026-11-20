# Mobile counter

A small Svelte app for the experimental txiki.js mobile host. From this directory, run:

```sh
npx gpuix-svelte mobile build android
npx gpuix-svelte mobile run android --device <serial>
npx gpuix-svelte mobile build ios --simulator
npx gpuix-svelte mobile run ios --simulator --device <udid>
```

The counter checks the filesystem, document picker, clipboard, native input and URL opening. See
[MOBILE_SUPPORT.md](../../MOBILE_SUPPORT.md) for prerequisites and current limits.
