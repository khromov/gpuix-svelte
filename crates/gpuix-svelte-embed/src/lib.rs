//! Embeds gpuix-svelte in a GPUI app that owns its own windows. A [`SvelteSlot`]
//! is an ordinary gpui view: it spawns a Bun sidecar running the component through
//! `gpuix-svelte/embed`, applies the batches the sidecar sends to a retained tree,
//! and paints that tree with gpuix-native's element builder wherever the host puts
//! the view. Pointer and key events go back the other way, and the host and the
//! component talk through `set_props`, `emit` and `on_call`.
//!
//! The wire is one JSON line per message, `<kind> <id> <json>`: batches, queries
//! and host calls come up the sidecar's stdout, events, props, host events and call
//! replies go down its stdin, and the answers to batches and queries, which the
//! renderer needs synchronously, go through a FIFO (a named pipe on Windows) the
//! sidecar blocks on.

use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures::channel::mpsc::{unbounded, UnboundedSender};
use futures::StreamExt;
use gpui::{div, prelude::*, App, Context, Entity, Render, Task, Window};
use gpuix_native::retained_tree::RetainedTree;
use gpuix_native::{apply_batch_to_tree, EventCallback, EventPayload, GpuixView};
use serde_json::{json, Value};

/// Run once on the host's `App`, before the first slot: the text field key
/// bindings and the HTTP client `<img src="https://…">` loads through.
pub use gpuix_native::init;

/// Each slot's sidecar numbers its elements from its own 2^32 range, because the
/// bounds the paint records are keyed by element id for the whole process.
static SLOTS: AtomicU64 = AtomicU64::new(0);

pub struct SlotOptions {
    /// The sidecar: a program and its arguments, running an entry that calls
    /// `embed()` from `gpuix-svelte/embed`. [`SlotOptions::bun`] builds the usual one.
    pub command: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub env: Vec<(String, String)>,
    /// What the component's `$props()` start as; [`SvelteSlot::set_props`] changes them.
    pub props: Value,
}

impl SlotOptions {
    /// Runs `entry` on Bun with the conditions and loader Svelte's custom renderer
    /// needs, as `gpuix-svelte <entry>` would, resolved from `cwd`.
    pub fn bun(entry: impl Into<String>, cwd: impl Into<PathBuf>) -> Self {
        Self {
            command: [
                "bun",
                "--conditions",
                "custom-renderer",
                "--conditions",
                "development",
                "--preload",
                "gpuix-svelte/plugin",
            ]
            .into_iter()
            .map(String::from)
            .chain([entry.into()])
            .collect(),
            cwd: Some(cwd.into()),
            env: Vec::new(),
            props: Value::Object(Default::default()),
        }
    }

    pub fn props(mut self, props: Value) -> Self {
        self.props = props;
        self
    }

    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }
}

/// A function the component reaches with `host.call(name, ...args)`. It runs on
/// the UI thread with the slot's context; what it returns resolves the promise.
pub type CallHandler = Box<dyn FnMut(Value, &mut Context<SvelteSlot>) -> Result<Value, String>>;

enum Msg {
    Invalidate,
    Call {
        id: u64,
        name: String,
        args: Value,
    },
    Query {
        query: String,
        args: Value,
        reply: SyncSender<Result<Value, String>>,
    },
    Exited,
}

pub struct SvelteSlot {
    view: Entity<GpuixView>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Option<Child>,
    reply_path: PathBuf,
    handlers: HashMap<String, CallHandler>,
    exit: Option<Option<i32>>,
    _pump: Task<()>,
}

impl SvelteSlot {
    /// Spawns the sidecar and returns the view to put in a layout. Dropping the
    /// entity ends the sidecar.
    pub fn spawn(options: SlotOptions, cx: &mut App) -> io::Result<Entity<Self>> {
        let index = SLOTS.fetch_add(1, Ordering::Relaxed);
        let id_base = index << 32;
        let (program, args) = options.command.split_first().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "SlotOptions::command is empty")
        })?;

        let reply_path = reply_path(index);
        let reply = open_fifo(&reply_path)?;

        let mut command = Command::new(program);
        command
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .env("GPUIX_EMBED", "1")
            .env("GPUIX_EMBED_ID_BASE", id_base.to_string())
            .env("GPUIX_EMBED_REPLY", &reply_path)
            .envs(options.env.iter().map(|(k, v)| (k, v)));
        if let Some(cwd) = &options.cwd {
            command.current_dir(cwd);
        }
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let _ = std::fs::remove_file(&reply_path);
                return Err(error);
            }
        };
        let child_stdin = child.stdin.take().expect("stdin is piped");
        let child_stdout = child.stdout.take().expect("stdout is piped");
        let stdin = Arc::new(Mutex::new(Some(child_stdin)));
        send(&stdin, "init", 0, &options.props);

        let tree = Arc::new(Mutex::new(RetainedTree::new()));
        let (tx, mut rx) = unbounded::<Msg>();
        {
            let tree = tree.clone();
            let tx = tx.clone();
            std::thread::Builder::new()
                .name("gpuix-svelte-embed".into())
                .spawn(move || read_sidecar(child_stdout, reply, tree, tx))?;
        }

        let callback: EventCallback = {
            let stdin = stdin.clone();
            Arc::new(move |payload: EventPayload| send(&stdin, "event", 0, &payload))
        };
        let view = cx.new(|_| GpuixView::new(tree, Some(callback), None, Default::default()));

        Ok(cx.new(|cx| {
            let pump = cx.spawn({
                let view = view.clone();
                async move |this, cx| {
                    while let Some(msg) = rx.next().await {
                        match msg {
                            Msg::Invalidate => view.update(cx, |_, cx| cx.notify()),
                            Msg::Call { id, name, args } => {
                                if this
                                    .update(cx, |slot: &mut Self, cx| {
                                        slot.answer_call(id, &name, args, cx)
                                    })
                                    .is_err()
                                {
                                    break;
                                }
                            }
                            Msg::Query { query, args, reply } => {
                                let _ = reply.send(answer_query(&query, &args));
                            }
                            Msg::Exited => {
                                let _ = this.update(cx, |slot, cx| {
                                    let code = slot
                                        .child
                                        .as_mut()
                                        .and_then(|child| child.try_wait().ok().flatten())
                                        .and_then(|status| status.code());
                                    slot.exit = Some(code);
                                    cx.notify();
                                });
                                break;
                            }
                        }
                    }
                }
            });
            Self {
                view,
                stdin,
                child: Some(child),
                reply_path,
                handlers: HashMap::new(),
                exit: None,
                _pump: pump,
            }
        }))
    }

    /// Replaces the component's props; every `$props()` read re-runs.
    pub fn set_props(&self, props: Value) {
        send(&self.stdin, "props", 0, &props);
    }

    /// Delivers to the component's `host.on(name, handler)` subscribers.
    pub fn emit(&self, name: &str, data: Value) {
        send(&self.stdin, "emit", 0, &json!({ "name": name, "data": data }));
    }

    /// Answers the component's `host.call(name, ...args)`; `args` arrives as an array.
    pub fn on_call(
        &mut self,
        name: impl Into<String>,
        handler: impl FnMut(Value, &mut Context<Self>) -> Result<Value, String> + 'static,
    ) {
        self.handlers.insert(name.into(), Box::new(handler));
    }

    pub fn is_running(&self) -> bool {
        self.exit.is_none()
    }

    /// `Some(code)` once the sidecar has exited; the code is `None` when it died of a signal.
    pub fn exit_code(&self) -> Option<Option<i32>> {
        self.exit
    }

    fn answer_call(&mut self, id: u64, name: &str, args: Value, cx: &mut Context<Self>) {
        // Taken out for the call, so the handler can reach the slot through `cx`.
        let result = match self.handlers.remove(name) {
            Some(mut handler) => {
                let result = handler(args, cx);
                self.handlers.entry(name.to_string()).or_insert(handler);
                result
            }
            None => Err(format!("the host has no function named {name:?}")),
        };
        match result {
            Ok(value) => send(&self.stdin, "reply", id, &json!({ "ok": value })),
            Err(error) => send(&self.stdin, "reply", id, &json!({ "err": error })),
        }
    }
}

impl Render for SvelteSlot {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let root = div().size_full();
        match self.exit {
            None => root.child(self.view.clone()),
            Some(code) => root.flex().items_center().justify_center().child(format!(
                "Svelte sidecar exited{}",
                code.map(|code| format!(" with code {code}")).unwrap_or_default()
            )),
        }
    }
}

impl Drop for SvelteSlot {
    fn drop(&mut self) {
        // EOF on stdin is the sidecar's cue to unmount and exit.
        if let Ok(mut stdin) = self.stdin.lock() {
            stdin.take();
        }
        let _ = std::fs::remove_file(&self.reply_path);
        if let Some(mut child) = self.child.take() {
            std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(2);
                loop {
                    match child.try_wait() {
                        Ok(Some(_)) => return,
                        Ok(None) if Instant::now() < deadline => {
                            std::thread::sleep(Duration::from_millis(20))
                        }
                        _ => {
                            let _ = child.kill();
                            let _ = child.wait();
                            return;
                        }
                    }
                }
            });
        }
    }
}

fn send<T: serde::Serialize>(stdin: &Mutex<Option<ChildStdin>>, kind: &str, id: u64, body: &T) {
    let Ok(mut guard) = stdin.lock() else { return };
    let Some(writer) = guard.as_mut() else { return };
    let Ok(json) = serde_json::to_string(body) else { return };
    if kind == "event" {
        log::trace!("gpuix-svelte-embed: {kind} {json}");
    } else {
        log::debug!("gpuix-svelte-embed: {kind} {id} {json}");
    }
    if writeln!(writer, "{kind} {id} {json}")
        .and_then(|_| writer.flush())
        .is_err()
    {
        *guard = None;
    }
}

fn parse_frame(line: &str) -> Option<(&str, u64, &str)> {
    let mut parts = line.splitn(3, ' ');
    let kind = parts.next()?;
    let id = parts.next()?.parse().ok()?;
    Some((kind, id, parts.next().unwrap_or("")))
}

fn answer(reply: &mut File, id: u64, result: Result<Value, String>) -> io::Result<()> {
    match result {
        Ok(value) => writeln!(reply, "ok {id} {value}"),
        Err(error) => writeln!(reply, "err {id} {}", Value::String(error)),
    }
}

fn read_sidecar(
    stdout: ChildStdout,
    mut reply: File,
    tree: Arc<Mutex<RetainedTree>>,
    tx: UnboundedSender<Msg>,
) {
    let mut connected = false;
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        // The sidecar opens the reply pipe before it writes anything, so waiting for it here never hangs.
        if !connected {
            if let Err(error) = accept_sidecar(&reply) {
                log::error!("gpuix-svelte-embed: the sidecar never opened the reply pipe: {error}");
                break;
            }
            connected = true;
        }
        let Some((kind, id, body)) = parse_frame(&line) else {
            log::warn!("gpuix-svelte-embed: unparseable line from the sidecar: {line}");
            continue;
        };
        match kind {
            "batch" => {
                let (result, dirty) = {
                    let mut tree = tree.lock().unwrap();
                    let result = apply_batch_to_tree(&mut tree, body.as_bytes());
                    (result, tree.take_dirty())
                };
                match &result {
                    Ok(destroyed) => log::debug!(
                        "gpuix-svelte-embed: batch {id}: {} bytes, {} destroyed, dirty={dirty}",
                        body.len(),
                        destroyed.len()
                    ),
                    Err(error) => log::error!("gpuix-svelte-embed: batch {id} refused: {error}"),
                }
                if answer(&mut reply, id, result.map(|ids| json!(ids))).is_err() {
                    break;
                }
                if dirty && tx.unbounded_send(Msg::Invalidate).is_err() {
                    break;
                }
            }
            "query" => {
                let request: Value = serde_json::from_str(body).unwrap_or(Value::Null);
                let query = request["q"].as_str().unwrap_or("").to_string();
                let args = request["args"].clone();
                let (sender, receiver) = sync_channel(1);
                let result = if tx
                    .unbounded_send(Msg::Query { query, args, reply: sender })
                    .is_ok()
                {
                    receiver
                        .recv()
                        .unwrap_or_else(|_| Err("the host is gone".to_string()))
                } else {
                    Err("the host is gone".to_string())
                };
                if answer(&mut reply, id, result).is_err() {
                    break;
                }
            }
            "call" => {
                let request: Value = serde_json::from_str(body).unwrap_or(Value::Null);
                let name = request["name"].as_str().unwrap_or("").to_string();
                let args = request["args"].clone();
                log::debug!("gpuix-svelte-embed: call {id} {name}({args})");
                if tx.unbounded_send(Msg::Call { id, name, args }).is_err() {
                    break;
                }
            }
            _ => log::warn!("gpuix-svelte-embed: unknown message kind {kind:?} from the sidecar"),
        }
    }
    let _ = tx.unbounded_send(Msg::Exited);
}

/// The reads the renderer makes synchronously; answered on the UI thread.
fn answer_query(query: &str, args: &Value) -> Result<Value, String> {
    match query {
        "bounds" => {
            let id = args[0]
                .as_f64()
                .ok_or_else(|| "bounds takes an element id".to_string())?;
            Ok(match gpuix_native::painted_bounds(id as u64) {
                Some(b) => json!({ "x": b.x, "y": b.y, "width": b.width, "height": b.height }),
                None => Value::Null,
            })
        }
        other => Err(format!("unknown query {other:?}")),
    }
}

#[cfg(unix)]
fn reply_path(index: u64) -> PathBuf {
    std::env::temp_dir().join(format!(
        "gpuix-svelte-embed-{}-{index}.fifo",
        std::process::id()
    ))
}

/// Opened read+write so this open never waits for the sidecar, which opens its
/// end read-only and blocks on it for each answer.
#[cfg(unix)]
fn open_fifo(path: &Path) -> io::Result<File> {
    let _ = std::fs::remove_file(path);
    let c_path = std::ffi::CString::new(path.as_os_str().as_encoded_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "fifo path has a NUL"))?;
    // SAFETY: a plain libc call on a NUL-terminated path that outlives it.
    if unsafe { libc::mkfifo(c_path.as_ptr(), 0o600) } != 0 {
        return Err(io::Error::last_os_error());
    }
    File::options().read(true).write(true).open(path)
}

#[cfg(unix)]
fn accept_sidecar(_reply: &File) -> io::Result<()> {
    Ok(())
}

#[cfg(windows)]
fn reply_path(index: u64) -> PathBuf {
    PathBuf::from(format!(
        r"\\.\pipe\gpuix-svelte-embed-{}-{index}",
        std::process::id()
    ))
}

/// The server end of a one-instance, outbound, byte-mode named pipe; the
/// sidecar's `openSync(path, 'r')` is its only client.
#[cfg(windows)]
fn open_fifo(path: &Path) -> io::Result<File> {
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::FromRawHandle;
    use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_OUTBOUND,
    };
    use windows_sys::Win32::System::Pipes::{
        CreateNamedPipeW, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
    };

    let name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: a NUL-terminated name that outlives the call, and no security attributes.
    let handle = unsafe {
        CreateNamedPipeW(
            name.as_ptr(),
            PIPE_ACCESS_OUTBOUND | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            64 * 1024,
            0,
            0,
            std::ptr::null(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: a handle CreateNamedPipeW just returned, owned by nothing else.
    Ok(unsafe { File::from_raw_handle(handle as _) })
}

/// Waits for the sidecar to open its end; one that already has is not an error.
#[cfg(windows)]
fn accept_sidecar(reply: &File) -> io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::ERROR_PIPE_CONNECTED;
    use windows_sys::Win32::System::Pipes::ConnectNamedPipe;

    // SAFETY: a valid pipe handle opened without FILE_FLAG_OVERLAPPED, so no OVERLAPPED is needed.
    if unsafe { ConnectNamedPipe(reply.as_raw_handle() as _, std::ptr::null_mut()) } != 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() == Some(ERROR_PIPE_CONNECTED as i32) {
        Ok(())
    } else {
        Err(error)
    }
}
