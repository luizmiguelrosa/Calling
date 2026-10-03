// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Reads the backend address from the process environment.
///
/// The webview cannot see the environment the app was launched from, so the
/// lookup happens here. An unset or blank variable resolves to `None` and the
/// client falls back to the address it persists itself.
#[tauri::command]
fn get_api_url() -> Option<String> {
    std::env::var("CALLING_API_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_api_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
