//! A Rust GPUI app that owns the window and mounts `Widget.svelte` twice, side by
//! side under its own toolbar: one sidecar and one component instance per slot, so
//! the two share nothing. The toolbar is plain gpui; each slot is a `SvelteSlot`.
//! Run it with `npm run demo:embed` from the repository root.

use std::time::{Duration, Instant};

use gpui::{
    div, prelude::*, px, rgb, size, App, Bounds, ClickEvent, Context, Entity, SharedString,
    TitlebarOptions, Window, WindowBounds, WindowOptions,
};
use gpuix_svelte_embed::{SlotOptions, SvelteSlot};
use serde_json::{json, Value};

const REPO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
const SLOTS: [&str; 2] = ["left", "right"];

struct Host {
    slots: Vec<Option<Entity<SvelteSlot>>>,
    started: Instant,
    pings: u32,
    dark: bool,
    last_call: SharedString,
}

impl Host {
    fn new(cx: &mut Context<Self>) -> Self {
        let mut host = Self {
            slots: vec![None; SLOTS.len()],
            started: Instant::now(),
            pings: 0,
            dark: true,
            last_call: "nothing yet".into(),
        };
        host.mount_all(cx);
        host
    }

    fn props(&self, index: usize) -> Value {
        json!({
            "user": SLOTS[index],
            "theme": if self.dark { "dark" } else { "light" },
            "pings": self.pings,
        })
    }

    fn mount_all(&mut self, cx: &mut Context<Self>) {
        for index in 0..SLOTS.len() {
            self.mount(index, cx);
        }
    }

    fn mount(&mut self, index: usize, cx: &mut Context<Self>) {
        let options =
            SlotOptions::bun("examples/rust-host/widget.ts", REPO).props(self.props(index));
        let slot = match SvelteSlot::spawn(options, cx) {
            Ok(slot) => slot,
            Err(error) => {
                self.last_call = format!("could not start the sidecar: {error}").into();
                return;
            }
        };
        let host = cx.weak_entity();
        slot.update(cx, |slot, _| {
            // `host.call('notify', text)` from the component lands here, on the UI thread.
            slot.on_call("notify", move |args, cx| {
                let text = args[0].as_str().unwrap_or("").to_string();
                host.update(cx, |host, cx| {
                    host.last_call = format!("{} slot: {text}", SLOTS[index]).into();
                    cx.notify();
                    json!({ "uptime": host.started.elapsed().as_secs() })
                })
                .map_err(|error| error.to_string())
            });
        });
        self.slots[index] = Some(slot);
    }

    fn tick(&mut self, cx: &mut Context<Self>) {
        let uptime = self.started.elapsed().as_secs();
        for slot in self.slots.iter().flatten() {
            slot.read(cx).emit("tick", json!({ "uptime": uptime }));
        }
    }

    fn push_props(&self, cx: &mut Context<Self>) {
        for (index, slot) in self.slots.iter().enumerate() {
            if let Some(slot) = slot {
                slot.read(cx).set_props(self.props(index));
            }
        }
    }
}

fn button(
    id: &'static str,
    label: impl Into<SharedString>,
    on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    div()
        .id(id)
        .px_3()
        .py_1()
        .rounded_md()
        .bg(rgb(0x313244))
        .hover(|style| style.bg(rgb(0x45475a)))
        .cursor_pointer()
        .text_sm()
        .child(label.into())
        .on_click(on_click)
}

impl Render for Host {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mounted = self.slots.iter().any(Option::is_some);
        let running = self
            .slots
            .iter()
            .flatten()
            .filter(|slot| slot.read(cx).is_running())
            .count();
        let toolbar = div()
            .flex()
            .items_center()
            .gap_2()
            .h(px(48.))
            .px_3()
            .bg(rgb(0x181825))
            .border_b_1()
            .border_color(rgb(0x313244))
            .text_color(rgb(0xcdd6f4))
            .child(
                div()
                    .font_weight(gpui::FontWeight::BOLD)
                    .child("Rust host (gpui): this toolbar and the status line are native"),
            )
            .child(div().flex_1())
            .child(button(
                "ping",
                "Ping the components",
                cx.listener(|this, _, _, cx| {
                    this.pings += 1;
                    this.push_props(cx);
                    cx.notify();
                }),
            ))
            .child(button(
                "theme",
                "Toggle theme",
                cx.listener(|this, _, _, cx| {
                    this.dark = !this.dark;
                    this.push_props(cx);
                    cx.notify();
                }),
            ))
            .child(button(
                "mount",
                if mounted { "Unmount both" } else { "Mount both" },
                cx.listener(|this, _, _, cx| {
                    // Dropping the entities ends the sidecars; new ones start fresh.
                    if this.slots.iter_mut().any(|slot| slot.take().is_some()) {
                        return cx.notify();
                    }
                    this.mount_all(cx);
                    cx.notify();
                }),
            ));
        let status = div()
            .flex()
            .items_center()
            .gap_4()
            .h(px(32.))
            .px_3()
            .bg(rgb(0x1e1e2e))
            .text_sm()
            .text_color(rgb(0xa6adc8))
            .child(format!("sidecars running: {running} of {}", SLOTS.len()))
            .child(format!("last host.call('notify'): {}", self.last_call));
        let mut body = div().flex().flex_1().min_h_0().gap_3().p_3();
        for (index, slot) in self.slots.iter().enumerate() {
            // The orange frame is the host's: everything inside it is the sidecar's.
            let frame = div()
                .flex_1()
                .min_h_0()
                .rounded_md()
                .border_2()
                .border_color(rgb(0xfab387))
                .overflow_hidden();
            let frame = match slot {
                Some(slot) => frame.child(slot.clone()),
                None => frame
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_color(rgb(0x6c7086))
                    .child("nothing mounted"),
            };
            body = body.child(
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w_0()
                    .gap_1()
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb(0xfab387))
                            .child(format!(
                                "↓ Svelte: Widget.svelte in the \"{}\" slot, its own bun sidecar",
                                SLOTS[index]
                            )),
                    )
                    .child(frame),
            );
        }
        div()
            .flex()
            .flex_col()
            .size_full()
            .bg(rgb(0x11111b))
            .child(toolbar)
            .child(status)
            .child(body)
    }
}

fn main() {
    env_logger::init();
    gpui_platform::application()
        .with_quit_mode(gpui::QuitMode::LastWindowClosed)
        .run(|cx: &mut App| {
            gpuix_svelte_embed::init(cx);
            let bounds = Bounds::centered(None, size(px(1100.), px(600.)), cx);
            let window = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(bounds)),
                        titlebar: Some(TitlebarOptions {
                            title: Some("gpuix-svelte inside a Rust app".into()),
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                    |_, cx| cx.new(Host::new),
                )
                .expect("the window opens");
            // Weak, so the clock ends with the window instead of keeping it alive.
            let host = window
                .update(cx, |_, _, cx| cx.weak_entity())
                .expect("the window is open");
            // A host-side clock the components subscribe to with `host.on('tick')`.
            cx.spawn(async move |cx| loop {
                cx.background_executor()
                    .timer(Duration::from_secs(1))
                    .await;
                if host.update(cx, |host, cx| host.tick(cx)).is_err() {
                    break;
                }
            })
            .detach();
            cx.activate(true);
        });
}
