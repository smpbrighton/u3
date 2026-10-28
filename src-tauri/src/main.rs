#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod platform;
#[cfg(windows)]
mod job;
mod updater_logic;
mod updater;

use serde::Serialize;
use std::io::{BufRead, BufReader, Error, ErrorKind};
#[cfg(debug_assertions)]
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{Manager, State};
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

// 엔진이 멈춰도 앱 종료가 5초 넘게 대기하지 않도록 제한한다.
const ENGINE_EXIT_TIMEOUT: Duration = Duration::from_secs(5);
const ENGINE_EXIT_POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Clone, Serialize)]
struct EngineConnection {
    port: u16,
    token: String,
}

struct EngineChild {
    child: Child,
    #[cfg(windows)]
    _job: job::EngineJob,
}
impl std::ops::Deref for EngineChild {
    type Target = Child;
    fn deref(&self) -> &Child { &self.child }
}
impl std::ops::DerefMut for EngineChild {
    fn deref_mut(&mut self) -> &mut Child { &mut self.child }
}

fn spawn_engine(command: &mut Command, token: &str) -> Result<EngineChild, Error> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows::Win32::System::Threading::CREATE_NO_WINDOW;
        command.creation_flags(CREATE_NO_WINDOW.0).env_remove("U3_TOKEN");
    }
    #[cfg(not(windows))]
    let _ = token;
    let child = command.spawn()?;
    #[cfg(windows)]
    {
        use std::io::Write;
        let mut child = child;
        let job = match job::EngineJob::new(&child) {
            Ok(job) => job,
            Err(error) => { let _ = child.kill(); let _ = child.wait(); return Err(error); }
        };
        let mut managed = EngineChild { child, _job: job };
        // Node가 자식을 만들기 전에 Job에 넣고 토큰을 전달한다.
        managed.stdin.as_mut().ok_or_else(|| Error::other("엔진 stdin이 없습니다"))?.write_all(format!("{token}\n").as_bytes())?;
        Ok(managed)
    }
    #[cfg(not(windows))]
    Ok(EngineChild { child })
}

struct EngineProcess {
    child: Mutex<Option<EngineChild>>,
    connection: Option<EngineConnection>,
    startup_error: Option<String>,
}

#[tauri::command]
fn engine_connection(engine: State<'_, EngineProcess>) -> Result<EngineConnection, String> {
    engine.connection.clone().ok_or_else(|| engine.startup_error.clone().unwrap_or_else(|| "엔진 연결 정보가 없습니다".to_string()))
}

#[cfg(debug_assertions)]
fn start_engine() -> Result<(EngineChild, EngineConnection), Box<dyn std::error::Error>> {
    let token = uuid::Uuid::new_v4().to_string();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| Error::new(ErrorKind::NotFound, "레포 경로를 찾지 못했습니다"))?
        .to_path_buf();
    let mut command = Command::new(platform::NODE);
    command.args(["--import", "tsx", "src/engine/main.ts"])
        .current_dir(root)
        .env("U3_TOKEN", &token)
        .env("TAURI_ORIGIN", "http://127.0.0.1:1420")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    let mut child = spawn_engine(&mut command, &token)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| Error::new(ErrorKind::Other, "엔진 stdout을 열지 못했습니다"))?;
    let mut line = String::new();
    BufReader::new(stdout).read_line(&mut line)?;
    let port = line
        .trim()
        .strip_prefix("PORT ")
        .ok_or_else(|| Error::new(ErrorKind::InvalidData, "엔진이 PORT 응답을 보내지 않았습니다"))?
        .parse::<u16>()?;
    Ok((child, EngineConnection { port, token }))
}

#[cfg(any(not(debug_assertions), test))]
fn bundled_engine_command(resources: &std::path::Path, token: &str) -> Result<Command, Error> {
    let library = resources.join("library");
    let chrome = resources.join("chrome").join(
        std::fs::read_to_string(resources.join("chrome-path.txt"))?.trim(),
    );
    let mut command = Command::new(resources.join(platform::NODE));
    command.arg(resources.join("engine.mjs"))
        .env("U3_TOKEN", token)
        .env("TAURI_ORIGIN", platform::ORIGIN)
        .env("U3_RESOURCE_DIR", &resources)
        .env("U3_FONT_DIR", resources.join("assets/fonts"))
        .env("U3_LIBRARY_DIR", &library)
        .env("U3_MRX_MODEL", resources.join("models/mrx.int8.onnx"))
        .env("U3_WHISPER_CLI", resources.join(format!("bin/whisper-cli{}", platform::EXE_SUFFIX)))
        .env("U3_SILERO_MODEL", resources.join("models/ggml-silero-v6.2.0.bin"))
        .env("U3_REMOTION_BUNDLE", resources.join("remotion-bundle"))
        .env("U3_CHROME_EXECUTABLE", chrome)
        .env("FFMPEG_BIN", resources.join(format!("node_modules/{}/ffmpeg{}", platform::COMPOSITOR, platform::EXE_SUFFIX)))
        .env("FFPROBE_BIN", resources.join(format!("node_modules/{}/ffprobe{}", platform::COMPOSITOR, platform::EXE_SUFFIX)))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    command.env("U3_KEY_STORE_CLI", resources.join("bin/u3-key-store.exe"));
    Ok(command)
}

#[cfg(not(debug_assertions))]
fn start_engine(app: &tauri::AppHandle) -> Result<(EngineChild, EngineConnection), Box<dyn std::error::Error>> {
    let token = uuid::Uuid::new_v4().to_string();
    let resources = app.path().resource_dir()?.join("resources");
    let mut command = bundled_engine_command(&resources, &token)?;
    #[cfg(windows)]
    command.env("U3_DATA_DIR", app.path().app_local_data_dir()?);
    let mut child = spawn_engine(&mut command, &token)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| Error::new(ErrorKind::Other, "엔진 stdout을 열지 못했습니다"))?;
    let mut line = String::new();
    let port = BufReader::new(stdout)
        .read_line(&mut line)
        .and_then(|_| {
            line.trim()
                .strip_prefix("PORT ")
                .ok_or_else(|| Error::new(ErrorKind::InvalidData, "엔진이 PORT 응답을 보내지 않았습니다"))?
                .parse::<u16>()
                .map_err(|error| Error::new(ErrorKind::InvalidData, error))
        });
    let port = match port {
        Ok(port) if port > 0 => Ok(port),
        Ok(_) => Err(Error::new(ErrorKind::InvalidData, "엔진이 유효하지 않은 포트를 보냈습니다")),
        Err(error) => Err(error),
    };
    let port = match port {
        Ok(port) => port,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Box::new(error));
        }
    };
    Ok((child, EngineConnection { port, token }))
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_menu(macos_menu(app)?)?;
            #[cfg(debug_assertions)]
            {
                let (child, connection) = start_engine()?;
                app.manage(EngineProcess {
                    child: Mutex::new(Some(child)),
                    connection: Some(connection),
                    startup_error: None,
                });
            }
            #[cfg(not(debug_assertions))]
            {
                match start_engine(app.handle()) {
                    Ok((child, connection)) => {
                        app.manage(EngineProcess {
                            child: Mutex::new(Some(child)),
                            connection: Some(connection),
                            startup_error: None,
                        });
                    }
                    Err(error) => {
                        let message = format!("U3 엔진을 시작하지 못했습니다: {error}");
                        eprintln!("{message}");
                        app.manage(EngineProcess {
                            child: Mutex::new(None),
                            connection: None,
                            startup_error: Some(message),
                        });
                    }
                }
            }
            updater::setup(app.handle());
            Ok(())
        });
    builder
        .invoke_handler(tauri::generate_handler![engine_connection, updater::update_status, updater::update_check_now, updater::update_restart])
        .build(tauri::generate_context!())
        .expect("failed to build U3")
        .run(|app, event| {
            if let tauri::RunEvent::WindowEvent { event: tauri::WindowEvent::Focused(true), .. } = &event {
                updater::focus(app);
            }
            if let tauri::RunEvent::Exit = event {
                updater::stop(app);
                stop_engine(app);
                updater::install_on_exit(app);
            }
        });
}

#[cfg(target_os = "macos")]
fn macos_menu<M: Manager<tauri::Wry>>(manager: &M) -> tauri::Result<Menu<tauri::Wry>> {
    let app = manager.app_handle();
    let package_name = app.package_info().name.clone();
    let app_menu = Submenu::with_items(app, package_name, true, &[
        &PredefinedMenuItem::about(app, None, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::services(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::hide(app, None)?,
        &PredefinedMenuItem::hide_others(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::quit(app, None)?,
    ])?;
    let edit_menu = Submenu::with_items(app, "Edit", true, &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;
    let view_menu = Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?;
    let window_menu = Submenu::with_items(app, "Window", true, &[
        &PredefinedMenuItem::maximize(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::close_window(app, None)?,
    ])?;
    let help_menu = Submenu::with_items(app, "Help", true, &[])?;
    Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &window_menu, &help_menu])
}

#[cfg(test)]
mod bundled_engine_tests {
    use super::*;

    #[test]
    fn packaged_engine_runs_node_directly_with_the_existing_arguments_and_environment() {
        let resources = std::env::temp_dir().join(format!("u3 engine resources {}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&resources).unwrap();
        std::fs::write(resources.join("chrome-path.txt"), "chrome-headless-shell\n").unwrap();
        let command = bundled_engine_command(&resources, "test-token").unwrap();
        assert_eq!(command.get_program(), resources.join(platform::NODE).as_os_str());
        assert_eq!(command.get_args().collect::<Vec<_>>(), vec![resources.join("engine.mjs").as_os_str()]);
        let env: std::collections::HashMap<_, _> = command.get_envs().map(|(key, value)| (key.to_string_lossy().into_owned(), value.unwrap().to_string_lossy().into_owned())).collect();
        assert_eq!(env.get("U3_TOKEN").unwrap(), "test-token");
        assert_eq!(env.get("TAURI_ORIGIN").unwrap(), platform::ORIGIN);
        for (key, relative) in [
            ("U3_RESOURCE_DIR", ""), ("U3_FONT_DIR", "assets/fonts"), ("U3_LIBRARY_DIR", "library"),
            ("U3_MRX_MODEL", "models/mrx.int8.onnx"),
            ("U3_SILERO_MODEL", "models/ggml-silero-v6.2.0.bin"), ("U3_REMOTION_BUNDLE", "remotion-bundle"),
        ] {
            let expected = if relative.is_empty() { resources.clone() } else { resources.join(relative) };
            assert_eq!(env.get(key).unwrap(), &expected.to_string_lossy());
        }
        // chrome 경로는 코드가 join 을 두 번 하므로 OS 구분자로 이어진다. 기대값도 같은 방식으로 만든다.
        assert_eq!(env.get("U3_CHROME_EXECUTABLE").unwrap(), &resources.join("chrome").join("chrome-headless-shell").to_string_lossy());
        assert_eq!(env.get("U3_WHISPER_CLI").unwrap(), &resources.join(format!("bin/whisper-cli{}", platform::EXE_SUFFIX)).to_string_lossy());
        for (key, name) in [("FFMPEG_BIN", "ffmpeg"), ("FFPROBE_BIN", "ffprobe")] {
            assert_eq!(env.get(key).unwrap(), &resources.join(format!("node_modules/{}/{}{}", platform::COMPOSITOR, name, platform::EXE_SUFFIX)).to_string_lossy());
        }
        #[cfg(windows)]
        assert_eq!(env.get("U3_KEY_STORE_CLI").unwrap(), &resources.join("bin/u3-key-store.exe").to_string_lossy());
        std::fs::remove_dir_all(resources).unwrap();
    }
}

pub(crate) fn stop_engine(app: &tauri::AppHandle) {
                if let Some(engine) = app.try_state::<EngineProcess>() {
                    if let Ok(mut child) = engine.child.lock() {
                        if let Some(mut child) = child.take() {
                            drop(child.stdin.take());
                            let deadline = Instant::now() + ENGINE_EXIT_TIMEOUT;
                            loop {
                                match child.try_wait() {
                                    Ok(Some(_)) => break,
                                    Ok(None) if Instant::now() < deadline => {
                                        sleep(ENGINE_EXIT_POLL_INTERVAL)
                                    }
                                    Ok(None) | Err(_) => {
                                        let _ = child.kill();
                                        let _ = child.wait();
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
}
