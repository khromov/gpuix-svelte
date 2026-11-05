//! An existing Rust app that keeps its `main`, its state and its own loop, and grows a
//! GPUI window by spawning the gpuix-svelte UI as a child: the app is the model, the UI
//! is the view, and JSON lines on the child's stdin/stdout are the bus.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// The app's state, which never leaves this process.
#[derive(Default, Serialize)]
struct Model {
    counter: i64,
    items: Vec<String>,
    /// Something the app produces on its own: a reading the UI only displays.
    reading: f64,
    uptime_s: u64,
}

/// What the view may ask for.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Command_ {
    Increment,
    Decrement,
    AddItem { text: String },
    RemoveItem { index: usize },
    Reset,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Message<'a> {
    State { model: &'a Model },
    Toast { text: String },
}

impl Model {
    fn apply(&mut self, cmd: Command_) -> Option<String> {
        match cmd {
            Command_::Increment => self.counter += 1,
            Command_::Decrement => self.counter -= 1,
            Command_::AddItem { text } if !text.trim().is_empty() => self.items.push(text.trim().to_string()),
            Command_::AddItem { .. } => return Some("nothing to add".into()),
            Command_::RemoveItem { index } if index < self.items.len() => {
                let gone = self.items.remove(index);
                return Some(format!("removed {gone}"));
            }
            Command_::RemoveItem { .. } => return Some("no such item".into()),
            Command_::Reset => *self = Model { reading: self.reading, uptime_s: self.uptime_s, ..Model::default() },
        }
        None
    }
}

enum Event {
    Command(Command_),
    UiGone,
    Tick,
}

fn spawn_ui() -> Child {
    // Argv names the UI; a shipped app points at the compiled gpuix-svelte binary beside it.
    let mut argv = std::env::args().skip(1);
    let program = argv.next().expect("usage: rust-host <ui-program> [args…]");
    Command::new(program)
        .args(argv)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("spawn the UI")
}

fn main() {
    let mut ui = spawn_ui();
    let mut to_ui = ui.stdin.take().unwrap();
    let from_ui = BufReader::new(ui.stdout.take().unwrap());
    let (tx, rx) = mpsc::channel();

    let reader_tx = tx.clone();
    thread::spawn(move || {
        for line in from_ui.lines() {
            let Ok(line) = line else { break };
            match serde_json::from_str::<Command_>(&line) {
                Ok(cmd) => {
                    if reader_tx.send(Event::Command(cmd)).is_err() {
                        break;
                    }
                }
                Err(err) => eprintln!("[rust-host] ignoring {line:?}: {err}"),
            }
        }
        let _ = reader_tx.send(Event::UiGone);
    });
    thread::spawn(move || {
        while tx.send(Event::Tick).is_ok() {
            thread::sleep(Duration::from_millis(500));
        }
    });

    let started = Instant::now();
    let mut model = Model { items: vec!["written in Rust".into(), "shown by Svelte".into()], ..Model::default() };
    let mut send = |msg: &Message| -> bool {
        let mut line = serde_json::to_string(msg).unwrap();
        line.push('\n');
        to_ui.write_all(line.as_bytes()).and_then(|_| to_ui.flush()).is_ok()
    };
    send(&Message::State { model: &model });

    for event in rx {
        let toast = match event {
            Event::Command(cmd) => model.apply(cmd),
            Event::Tick => {
                let t = started.elapsed().as_secs_f64();
                model.uptime_s = t as u64;
                model.reading = 20.0 + 5.0 * (t / 3.0).sin() + 0.3 * (t * 7.0).cos();
                None
            }
            Event::UiGone => break,
        };
        if !send(&Message::State { model: &model }) {
            break;
        }
        if let Some(text) = toast {
            send(&Message::Toast { text });
        }
    }

    let _ = ui.wait();
    eprintln!("[rust-host] UI closed, exiting with counter={} items={}", model.counter, model.items.len());
}
