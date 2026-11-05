//! Wire: one message per line. JS → Rust lines are commands; Rust → JS lines are
//! `= <reply>` for an answer and `! <event>` for something Rust sends unprompted.

use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

fn main() {
    let out = Arc::new(Mutex::new(io::stdout()));

    let ticker_out = Arc::clone(&out);
    thread::spawn(move || {
        for n in 1u64.. {
            thread::sleep(Duration::from_secs(1));
            let mut out = ticker_out.lock().unwrap();
            if writeln!(out, "! {}", hello_core::tick(n)).and_then(|_| out.flush()).is_err() {
                return;
            }
        }
    });

    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let reply = hello_core::handle(&line);
        let mut out = out.lock().unwrap();
        if writeln!(out, "= {reply}").and_then(|_| out.flush()).is_err() {
            break;
        }
    }
    // stdin closed: the host is gone, so exit and let the ticker thread die with us.
}
