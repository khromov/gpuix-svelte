//! The "existing Rust code": a tiny command interpreter every transport wraps.
//! It knows nothing about JS, GPUI or how messages reach it.

pub fn handle(msg: &str) -> String {
    let msg = msg.trim();
    let (cmd, rest) = msg.split_once(' ').unwrap_or((msg, ""));
    let rest = rest.trim();
    match cmd {
        "greet" => {
            let name = if rest.is_empty() { "world" } else { rest };
            format!("Hello, {name}! Greetings from Rust {}", rustc_version())
        }
        "add" => match parse_numbers(rest) {
            Some(nums) => nums.iter().sum::<f64>().to_string(),
            None => "add wants numbers, e.g. `add 2 3.5`".into(),
        },
        "upper" => rest.to_uppercase(),
        "fib" => match rest.parse::<u32>() {
            Ok(n) if n <= 90 => fib(n).to_string(),
            _ => "fib wants an integer up to 90".into(),
        },
        "" => "say something: greet <name>, add <a> <b> …, upper <text>, fib <n>".into(),
        other => format!("unknown command `{other}` (try greet, add, upper, fib)"),
    }
}

/// What Rust pushes on its own, without being asked.
pub fn tick(n: u64) -> String {
    format!("tick {n}")
}

fn parse_numbers(s: &str) -> Option<Vec<f64>> {
    if s.is_empty() {
        return None;
    }
    s.split_whitespace().map(|p| p.parse().ok()).collect()
}

fn fib(n: u32) -> u64 {
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n {
        (a, b) = (b, a + b);
    }
    a
}

fn rustc_version() -> &'static str {
    option_env!("RUSTC_VERSION").unwrap_or("(unknown rustc)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands() {
        assert!(handle("greet gpuix").starts_with("Hello, gpuix!"));
        assert_eq!(handle("add 2 3.5"), "5.5");
        assert_eq!(handle("upper abc"), "ABC");
        assert_eq!(handle("fib 10"), "55");
        assert!(handle("nope").starts_with("unknown command"));
    }
}
