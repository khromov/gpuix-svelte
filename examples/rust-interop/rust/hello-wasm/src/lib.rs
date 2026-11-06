//! Raw wasm32 with no wasm-bindgen: JS writes a message into memory it got from
//! `alloc`, calls `send`, and every string Rust produces comes back through the
//! imported `emit(ptr, len)`, replies and events alike.

#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn emit(ptr: *const u8, len: usize);
}

fn emit_str(s: &str) {
    unsafe { emit(s.as_ptr(), s.len()) }
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr`/`len` must describe a buffer from `alloc`, which this call frees.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn send(ptr: *mut u8, len: usize) {
    let bytes = unsafe { Vec::from_raw_parts(ptr, len, len) };
    emit_str(&hello_core::handle(&String::from_utf8_lossy(&bytes)));
}

/// wasm32-unknown-unknown has no threads or timers, so the host drives the clock.
#[unsafe(no_mangle)]
pub extern "C" fn tick(n: u64) {
    emit_str(&hello_core::tick(n));
}
