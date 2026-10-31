fn main() {
    // gpuix-native's napi bindings compile in with it and reference `napi_*`
    // symbols only Node provides; nothing here calls them, so the executable
    // links with them unresolved, the way a `.node` cdylib does.
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if os == "macos" {
        println!("cargo:rustc-link-arg-bins=-Wl,-undefined,dynamic_lookup");
    } else if os == "linux" {
        println!("cargo:rustc-link-arg-bins=-Wl,--unresolved-symbols=ignore-all");
    }
}
