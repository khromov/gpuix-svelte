use gpui::App;
use serde_json::json;
use std::{io::{Read, Write, ErrorKind}, net::{TcpListener, TcpStream}, os::unix::fs::OpenOptionsExt, sync::{Arc, Mutex}, time::Duration};

struct Session {
    listener: TcpListener,
    stream: Option<TcpStream>,
    renderer: gpuix_core::EmbeddedRenderer,
    events: Arc<Mutex<Vec<gpuix_core::EventPayload>>>,
    prompts: gpuix_svelte_txiki_host::dispatch::Prompts,
    incoming: Vec<u8>,
    outgoing: Vec<u8>,
    token: String,
    authenticated: bool,
}
impl Session {
    fn new() -> anyhow::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        listener.set_nonblocking(true)?;
        let mut bytes = [0u8; 32];
        std::fs::File::open("/dev/urandom")?.read_exact(&mut bytes)?;
        let token: String = bytes.iter().map(|v| format!("{v:02x}")).collect();
        let port = listener.local_addr()?.port();
        let path = std::env::temp_dir().join("gpuix-txiki-bridge");
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
        write!(file, "{port} {token}")?;
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        Ok(Self {
            listener, stream: None, events: events.clone(), prompts: Default::default(), incoming: Vec::new(),
            outgoing: Vec::new(), token, authenticated: false,
            renderer: gpuix_core::EmbeddedRenderer::with_event_callback(Some(Arc::new(move |event| {
                sink.lock().unwrap().push(event);
            }))),
        })
    }


    fn pump(&mut self) -> anyhow::Result<()> {
        if self.stream.is_none() {
            match self.listener.accept() {
                Ok((stream, _)) => { stream.set_nonblocking(true)?; self.stream = Some(stream); }
                Err(e) if e.kind() == ErrorKind::WouldBlock => return Ok(()),
                Err(e) => return Err(e.into()),
            }
        }
        let stream = self.stream.as_mut().unwrap();
        if !self.outgoing.is_empty() {
            match stream.write(&self.outgoing) {
                Ok(0) => anyhow::bail!("Bridge closed"),
                Ok(n) => { self.outgoing.drain(..n); }
                Err(e) if e.kind() == ErrorKind::WouldBlock => return Ok(()),
                Err(e) => return Err(e.into()),
            }
        }
        let mut buffer = [0u8; 16384];
        loop {
            match self.stream.as_mut().unwrap().read(&mut buffer) {
                Ok(0) => anyhow::bail!("Bridge closed"),
                Ok(n) => self.incoming.extend_from_slice(&buffer[..n]),
                Err(e) if e.kind() == ErrorKind::WouldBlock => break,
                Err(e) => return Err(e.into()),
            }
            if self.incoming.len() > 8 * 1024 * 1024 { anyhow::bail!("Request too large"); }
        }
        while let Some(end) = self.incoming.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.incoming.drain(..=end).collect();
            if !self.authenticated {
                if line.strip_suffix(b"\n") != Some(self.token.as_bytes()) { anyhow::bail!("Bridge authentication failed"); }
                self.authenticated = true;
                continue;
            }
            let result = serde_json::from_slice(&line).map_err(anyhow::Error::from).and_then(|request| gpuix_svelte_txiki_host::dispatch::dispatch(&self.renderer, &self.events, &self.prompts, request));
            let reply = match result { Ok(value) => json!({ "value": value }), Err(error) => json!({ "error": error.to_string() }) };
            self.outgoing.extend_from_slice(serde_json::to_string(&reply)?.as_bytes());
            self.outgoing.push(b'\n');
        }
        Ok(())
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(std::env::temp_dir().join("gpuix-txiki-bridge"));
    }
}

fn start(cx: &mut App) {
    gpuix_core::init(cx);
    let app = cx.to_async();
    let task = cx.spawn(async move |cx| {
        gpuix_core::install_host(app);
        let mut session = match Session::new() {
            Ok(session) => session,
            Err(error) => { eprintln!("txiki bridge startup: {error}"); return; }
        };
        loop {
            if let Err(error) = session.pump() { eprintln!("txiki bridge stopped: {error}"); break; }
            cx.background_executor().timer(Duration::from_millis(4)).await;
        }
    });
    let mut task = Some(task);
    cx.on_app_quit(move |_| { drop(task.take()); std::future::ready(()) }).detach();
}

#[no_mangle]
pub extern "C" fn gpuix_ios_start() {
    std::panic::set_hook(Box::new(|info| eprintln!("GPUix panic: {info}")));
    gpui_mobile::ios::ffi::set_app_callback(Box::new(start));
    gpui_mobile::ios::ffi::run_app();
}
