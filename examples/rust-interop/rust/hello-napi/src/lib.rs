//! A Node-API addon through napi-rs: typed arguments, and a ThreadsafeFunction lets a
//! Rust thread call back into JS on the event loop, no polling.

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

static RUNNING: AtomicBool = AtomicBool::new(false);

#[napi]
pub fn send(msg: String) -> String {
    hello_core::handle(&msg)
}

#[napi]
pub fn subscribe(callback: ThreadsafeFunction<String, (), String, Status, false>) -> Result<()> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err(Error::from_reason("already subscribed"));
    }
    thread::spawn(move || {
        for n in 1u64.. {
            thread::sleep(Duration::from_secs(1));
            if !RUNNING.load(Ordering::SeqCst) {
                return;
            }
            if callback.call(hello_core::tick(n), ThreadsafeFunctionCallMode::NonBlocking) != Status::Ok {
                return;
            }
        }
    });
    Ok(())
}

#[napi]
pub fn unsubscribe() {
    RUNNING.store(false, Ordering::SeqCst);
}
