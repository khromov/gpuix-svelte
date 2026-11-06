//! A Rust binary that is the whole app: `main` owns the process, an embedded Deno
//! (rustyscript) runs the bundled gpuix-svelte view, `@gpuix/native` loads through
//! Deno's Node-API, and the view calls Rust closures directly. No addon of our own,
//! no FFI, no child process.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use rustyscript::serde_json::Value;
use rustyscript::{Error, Module, Runtime, RuntimeOptions};

fn main() -> Result<(), Error> {
    let bundle = std::env::args().nth(1).expect("usage: rust-embed <path/to/boot.mjs>");

    // Something the app does on its own, which the view picks up with `rust_poll`.
    let queue: Arc<Mutex<VecDeque<String>>> = Arc::default();
    {
        let queue = Arc::clone(&queue);
        thread::spawn(move || {
            for n in 1u64.. {
                thread::sleep(Duration::from_secs(1));
                queue.lock().unwrap().push_back(hello_core::tick(n));
            }
        });
    }

    let mut runtime = Runtime::new(RuntimeOptions::default())?;
    runtime.register_function("rust_handle", |args: &[Value]| {
        let msg = args.first().and_then(Value::as_str).unwrap_or("");
        Ok(Value::String(hello_core::handle(msg)))
    })?;
    runtime.register_function("rust_poll", move |_: &[Value]| {
        let drained = queue.lock().unwrap().drain(..).map(Value::String).collect();
        Ok(Value::Array(drained))
    })?;

    // load_module runs the event loop to completion, so the window's frame loop lives here
    // and this returns when the last window closes.
    let module = Module::load(&bundle)?;
    runtime.load_module(&module)?;
    eprintln!("[rust-embed] window closed, back in main()");
    Ok(())
}
