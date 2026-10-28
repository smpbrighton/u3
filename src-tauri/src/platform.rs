pub const NODE: &str = if cfg!(windows) { "node.exe" } else { "node" };
#[cfg(any(not(debug_assertions), test))]
pub const EXE_SUFFIX: &str = if cfg!(windows) { ".exe" } else { "" };
#[cfg(any(not(debug_assertions), test))]
pub const ORIGIN: &str = if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" };
#[cfg(any(not(debug_assertions), test))]
pub const COMPOSITOR: &str = if cfg!(windows) { "@remotion/compositor-win32-x64-msvc" } else { "@remotion/compositor-darwin-arm64" };
