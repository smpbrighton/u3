#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::io::{BufRead, BufReader, Error, ErrorKind};
#[cfg(debug_assertions)]
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{Manager, State};

// 엔진이 멈춰도 앱 종료가 5초 넘게 대기하지 않도록 제한한다.
const ENGINE_EXIT_TIMEOUT: Duration = Duration::from_secs(5);
const ENGINE_EXIT_POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Clone, Serialize)]
struct EngineConnection {
    port: u16,
    token: String,
}

struct EngineProcess {
    child: Mutex<Option<Child>>,
    connection: Option<EngineConnection>,
    startup_error: Option<String>,
}

#[tauri::command]
fn engine_connection(engine: State<'_, EngineProcess>) -> Result<EngineConnection, String> {
    engine.connection.clone().ok_or_else(|| engine.startup_error.clone().unwrap_or_else(|| "엔진 연결 정보가 없습니다".to_string()))
}

#[cfg(debug_assertions)]
fn start_engine() -> Result<(Child, EngineConnection), Box<dyn std::error::Error>> {
    let token = uuid::Uuid::new_v4().to_string();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| Error::new(ErrorKind::NotFound, "레포 경로를 찾지 못했습니다"))?
        .to_path_buf();
    let mut child = Command::new("node")
        .args(["--import", "tsx", "src/engine/main.ts"])
        .current_dir(root)
        .env("U3_TOKEN", &token)
        .env("TAURI_ORIGIN", "http://127.0.0.1:1420")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;
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

#[cfg(not(debug_assertions))]
fn start_engine(app: &tauri::AppHandle) -> Result<(Child, EngineConnection), Box<dyn std::error::Error>> {
    let token = uuid::Uuid::new_v4().to_string();
    let resources = app.path().resource_dir()?.join("resources");
    let executable = std::env::current_exe()?
        .parent()
        .ok_or_else(|| Error::new(ErrorKind::NotFound, "앱 실행 경로를 찾지 못했습니다"))?
        .join("u3-engine");
    let library = resources.join("library");
    let chrome = resources.join("chrome-headless-shell").join(
        std::fs::read_to_string(resources.join("chrome-path.txt"))?.trim(),
    );
    let mut child = Command::new(executable)
        .env("U3_TOKEN", &token)
        .env("TAURI_ORIGIN", "tauri://localhost")
        .env("U3_RESOURCE_DIR", &resources)
        .env("U3_FONT_DIR", resources.join("assets/fonts"))
        .env("U3_LIBRARY_DIR", &library)
        .env("U3_MRX_MODEL", resources.join("models/mrx.int8.onnx"))
        .env("U3_WHISPER_CLI", resources.join("bin/whisper-cli"))
        .env("U3_SILERO_MODEL", resources.join("models/ggml-silero-v6.2.0.bin"))
        .env("U3_REMOTION_BUNDLE", resources.join("remotion-bundle"))
        .env("U3_CHROME_EXECUTABLE", chrome)
        .env("FFMPEG_BIN", resources.join("node_modules/@remotion/compositor-darwin-arm64/ffmpeg"))
        .env("FFPROBE_BIN", resources.join("node_modules/@remotion/compositor-darwin-arm64/ffprobe"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;
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
        .setup(|app| {
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
            Ok(())
        });
    builder
        .invoke_handler(tauri::generate_handler![engine_connection])
        .build(tauri::generate_context!())
        .expect("failed to build U3")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
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
        });
}
