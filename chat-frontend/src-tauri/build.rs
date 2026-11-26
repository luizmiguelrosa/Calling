fn main() {
    // tauri-build only declares `rerun-if-changed` for tauri.conf.json and
    // capabilities, so without this a regenerated icon is never re-embedded:
    // cargo reuses the cached resource.lib (and its old icon bytes) and simply
    // relinks the exe, which then keeps showing the previous icon.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
