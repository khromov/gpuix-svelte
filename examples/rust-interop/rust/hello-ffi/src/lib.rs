//! A plain C ABI for `bun:ffi` / `node:ffi`. Strings cross as NUL-terminated UTF-8;
//! everything Rust hands out is freed with `hello_free`.

use std::collections::VecDeque;
use std::ffi::{CStr, CString, c_char};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

type Callback = extern "C" fn(*const c_char);

static QUEUE: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
static CALLBACK: Mutex<Option<Callback>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);

fn to_c(s: String) -> *mut c_char {
    CString::new(s).unwrap_or_default().into_raw()
}

/// # Safety
/// `msg` must be a valid NUL-terminated string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn hello_send(msg: *const c_char) -> *mut c_char {
    let msg = unsafe { CStr::from_ptr(msg) }.to_string_lossy();
    to_c(hello_core::handle(&msg))
}

/// Starts the ticker thread. Events go to the callback when one is set (the callee owns
/// the string), else they queue for `hello_poll`; the thread stops at `hello_stop`.
#[unsafe(no_mangle)]
pub extern "C" fn hello_start() {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(|| {
        for n in 1u64.. {
            thread::sleep(Duration::from_secs(1));
            if !RUNNING.load(Ordering::SeqCst) {
                return;
            }
            let event = hello_core::tick(n);
            let cb = *CALLBACK.lock().unwrap();
            match cb {
                // A threadsafe JS callback runs later on the JS thread, so the string
                // is handed over and the host frees it with `hello_free`.
                Some(cb) => cb(to_c(event)),
                None => QUEUE.lock().unwrap().push_back(event),
            }
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn hello_stop() {
    RUNNING.store(false, Ordering::SeqCst);
}

/// The next queued event, or null.
#[unsafe(no_mangle)]
pub extern "C" fn hello_poll() -> *mut c_char {
    match QUEUE.lock().unwrap().pop_front() {
        Some(s) => to_c(s),
        None => std::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn hello_set_callback(cb: Option<Callback>) {
    *CALLBACK.lock().unwrap() = cb;
}

/// # Safety
/// `p` must have come from this library and not have been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn hello_free(p: *mut c_char) {
    if !p.is_null() {
        drop(unsafe { CString::from_raw(p) });
    }
}
