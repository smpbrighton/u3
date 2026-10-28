#![cfg_attr(windows, windows_subsystem = "windows")]
#[cfg(windows)]
mod windows;

fn main() {
    #[cfg(windows)]
    std::process::exit(windows::run().unwrap_or(1));
    #[cfg(not(windows))]
    std::process::exit(1);
}
