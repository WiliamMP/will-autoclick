use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, SetCursorPos};

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub interval_ms: u64,
    pub button: Button,
    pub double: bool,
    /// 0 = until stopped
    pub repeat: u64,
    /// None = wherever the cursor is
    pub position: Option<Point>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Button {
    Left,
    Right,
    Middle,
}

impl Default for Config {
    fn default() -> Self {
        Config { interval_ms: 100, button: Button::Left, double: false, repeat: 0, position: None }
    }
}

/// `run` is a generation number: every start/stop bumps it, and a click thread
/// only keeps going while the number it was born with is still current.
/// Odd = running. This way a stale thread from a quick stop/start just exits.
#[derive(Default)]
pub struct Clicker {
    config: Mutex<Config>,
    run: Arc<AtomicU64>,
}

/// The frontend pushes the form here on every change, so F6 always uses the latest values
#[tauri::command]
pub fn set_config(config: Config, state: State<Clicker>) {
    *state.config.lock().unwrap() = config;
}

/// Start or stop; tells the window through the "running" event
#[tauri::command]
pub fn toggle(app: AppHandle, state: State<Clicker>) {
    let gen = state.run.fetch_add(1, Ordering::SeqCst) + 1;
    let running = gen % 2 == 1;
    let _ = app.emit("running", running);
    if !running {
        return;
    }
    let cfg = *state.config.lock().unwrap();
    let run = state.run.clone();
    std::thread::spawn(move || {
        click_loop(&cfg, || run.load(Ordering::SeqCst) == gen, || click(&cfg));
        // Finished by the repeat count (not by a stop): flip to stopped
        if run.compare_exchange(gen, gen + 1, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
            let _ = app.emit("running", false);
        }
    });
}

/// Current cursor position in screen pixels (F7 sends it to the window as "picked")
pub fn cursor() -> Point {
    let mut p = POINT { x: 0, y: 0 };
    unsafe { GetCursorPos(&mut p) };
    Point { x: p.x, y: p.y }
}

fn click_loop(cfg: &Config, alive: impl Fn() -> bool, click: impl Fn()) {
    let mut n = 0;
    while alive() && (cfg.repeat == 0 || n < cfg.repeat) {
        click();
        n += 1;
        // ponytail: sleep granularity is ~1-15 ms on Windows, fine for an auto clicker
        std::thread::sleep(Duration::from_millis(cfg.interval_ms.max(1)));
    }
}

/// Like Delphi's mouse_event, via SendInput: press + release, at the fixed point if set
fn click(cfg: &Config) {
    if let Some(p) = cfg.position {
        unsafe { SetCursorPos(p.x, p.y) };
    }
    let (down, up) = match cfg.button {
        Button::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        Button::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        Button::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
    };
    let times = if cfg.double { 2 } else { 1 };
    let inputs: Vec<INPUT> = (0..times)
        .flat_map(|_| [down, up])
        .map(|flags| {
            let mut input: INPUT = unsafe { std::mem::zeroed() };
            input.r#type = INPUT_MOUSE;
            input.Anonymous.mi.dwFlags = flags;
            input
        })
        .collect();
    unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn stops_at_repeat_count() {
        let cfg = Config { interval_ms: 1, repeat: 3, ..Default::default() };
        let n = Cell::new(0);
        click_loop(&cfg, || true, || n.set(n.get() + 1));
        assert_eq!(n.get(), 3);
    }

    #[test]
    fn stops_when_not_alive() {
        let cfg = Config { interval_ms: 1, repeat: 0, ..Default::default() };
        let n = Cell::new(0);
        click_loop(&cfg, || n.get() < 5, || n.set(n.get() + 1));
        assert_eq!(n.get(), 5);
    }
}
