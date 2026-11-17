mod clicker;

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, Shortcut, ShortcutState};

/// Called by the main window once it is rendered: show it, close the splash
#[tauri::command]
fn close_splash(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
    }
    if let Some(splash) = app.get_webview_window("splashscreen") {
        splash.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let f6 = Shortcut::new(None, Code::F6);
    let f7 = Shortcut::new(None, Code::F7);
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            // Global: they work with any other window focused
            // F6 = start/stop, F7 = take the cursor position as the fixed click point
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([f6, f7])
                .expect("F6/F7 shortcuts")
                .with_handler(move |app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    if *shortcut == f6 {
                        clicker::toggle(app.clone(), app.state());
                    } else {
                        let _ = app.emit("picked", clicker::cursor());
                    }
                })
                .build(),
        )
        .manage(clicker::Clicker::default())
        .invoke_handler(tauri::generate_handler![close_splash, clicker::set_config, clicker::toggle])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
