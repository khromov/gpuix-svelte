CSS `transition` and `transform` are silently ignored — there is no CSS engine to run them. Animation is a prop instead, evaluated natively on every frame:

```
motion={{ initial, animate, transition }}
```

- **`animate`** holds the target values. Change them and GPUI tweens from wherever the element currently is. Animatable keys: `left`, `top`, `width`, `height`, `opacity`, `borderRadius`.
- **`initial`** is where the element starts on mount; `initial: false` skips the entrance and starts at `animate`.
- **`transition`** takes `duration` in **seconds** (not milliseconds), an optional `delay`, and `ease`: `linear`, `ease`, `easeIn`, `easeOut`, `easeInOut` or a cubic-bezier array `[x1, y1, x2, y2]`.

Because `left` and `top` belong to a `position: absolute` element, animation composes with step 8's rules: the knob on the right carries `pointer-events: none` so the toggle behind it keeps receiving clicks. For anything the prop cannot express, drive `style:` directives from a `setInterval` inside an `$effect` — the liquid-glass demo's progress bar does exactly that.
