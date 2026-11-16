mod decode;
mod migrations;

use std::os::raw::c_char;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};

static APP: Mutex<Option<AppHandle>> = Mutex::new(None);

#[cfg(target_os = "macos")]
extern "C" {
    fn vision_scan_start(continuous: i32, callback: extern "C" fn(*const c_char, f64, *const c_char, *const c_char)) -> i32;
    fn vision_scan_stop();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:gestor.db", migrations::migrations())
                .build(),
        );
    #[cfg(target_os = "ios")]
    {
        builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    }
    builder
        .invoke_handler(tauri::generate_handler![
            scanner_backend,
            scanner_start,
            scanner_stop,
            decode_image_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Inventario Pro");
}

#[tauri::command]
fn scanner_backend() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "apple-vision"
    }
    #[cfg(target_os = "ios")]
    {
        "apple-visionkit"
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        "rxing"
    }
}

#[tauri::command]
fn scanner_start(app: AppHandle, continuous: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        *APP.lock().map_err(|_| "No se pudo preparar el escáner".to_string())? = Some(app);
        let code = unsafe { vision_scan_start(if continuous { 1 } else { 0 }, on_scan) };
        if code != 0 {
            return Err("No se pudo abrir la cámara".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, continuous);
        Err("El escáner de escritorio usa Apple Vision y solo está disponible en macOS.".into())
    }
}

#[tauri::command]
fn scanner_stop() {
    #[cfg(target_os = "macos")]
    unsafe {
        vision_scan_stop();
    }
}

#[tauri::command]
fn decode_image_bytes(bytes: Vec<u8>) -> Result<decode::ScanHit, String> {
    decode::decode_image_bytes(bytes)
}

#[cfg(target_os = "macos")]
extern "C" fn on_scan(text: *const c_char, elapsed_ms: f64, format: *const c_char, error: *const c_char) {
    let Ok(guard) = APP.lock() else { return };
    let app = guard.clone();
    drop(guard);
    let Some(app) = app else { return };
    let message = c_string(error);
    if !message.is_empty() {
        let _ = app.emit("barcode-scan-error", serde_json::json!({ "message": message }));
        return;
    }
    let _ = app.emit(
        "barcode-scanned",
        serde_json::json!({
            "text": c_string(text),
            "format": c_string(format),
            "elapsedMs": elapsed_ms,
            "engine": "apple-vision"
        }),
    );
}

#[cfg(target_os = "macos")]
fn c_string(ptr: *const c_char) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe { std::ffi::CStr::from_ptr(ptr) }.to_string_lossy().into_owned()
}
