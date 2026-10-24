#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::io::{BufRead, BufReader, Error, ErrorKind};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Clone, Serialize)]
struct EngineConnection {
    port: u16,
    token: String,
}

struct EngineProcess {
    child: Mutex<Option<Child>>,
    connection: Option<EngineConnection>,
}

#[tauri::command]
fn engine_connection(engine: State<'_, EngineProcess>) -> Result<EngineConnection, String> {
    engine.connection.clone().ok_or_else(|| "릴리스 엔진은 W8에서 추가합니다".to_string())
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

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let (child, connection) = start_engine()?;
                app.manage(EngineProcess {
                    child: Mutex::new(Some(child)),
                    connection: Some(connection),
                });
            }
            #[cfg(not(debug_assertions))]
            app.manage(EngineProcess {
                child: Mutex::new(None),
                connection: None,
            });
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
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
