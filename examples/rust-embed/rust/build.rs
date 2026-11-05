// The addon resolves napi_* against the executable, so the symbols deno_napi
// implements have to be exported from it, as the Deno CLI's own build script does.
fn main() {
    deno_napi::print_linker_flags("rust-embed");
}
