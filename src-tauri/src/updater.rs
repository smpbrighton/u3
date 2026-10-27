use crate::updater_logic::{Model, Reason, Snapshot};
use std::{fs, path::PathBuf, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

struct Prepared {
    update: Update,
    path: PathBuf,
}

pub struct UpdaterState(Mutex<Runtime>);
struct Runtime { model: Model, prepared: Option<Prepared> }

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn emit(app: &AppHandle, runtime: &Runtime) {
    let _ = app.emit("update-status", runtime.model.snapshot.clone());
}

pub fn setup(app: &AppHandle) {
    app.manage(UpdaterState(Mutex::new(Runtime {
        model: Model::new(app.package_info().version.to_string(), now()), prepared: None,
    })));
    if cfg!(debug_assertions) { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(30));
        check(&app, Reason::Startup);
        loop {
            std::thread::sleep(Duration::from_secs(30));
            if app.state::<UpdaterState>().0.lock().unwrap().model.stopped { return; }
            check(&app, Reason::Periodic);
        }
    });
}

pub fn focus(app: &AppHandle) { check(app, Reason::Focus); }

fn check(app: &AppHandle, reason: Reason) {
    {
        let state = app.state::<UpdaterState>();
        let mut runtime = state.0.lock().unwrap();
        if !runtime.model.begin(reason, now(), cfg!(debug_assertions)) { return; }
        emit(app, &runtime);
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(message) = check_and_download(&app).await {
            let state = app.state::<UpdaterState>();
            let mut runtime = state.0.lock().unwrap();
            runtime.model.fail(message);
            emit(&app, &runtime);
        }
    });
}

async fn check_and_download(app: &AppHandle) -> Result<(), String> {
    let updater = app.updater_builder().timeout(Duration::from_secs(30)).build().map_err(|e| e.to_string())?;
    let offered = updater.check().await.map_err(|e| format!("업데이트를 확인하지 못했어요: {e}"))?;
    let mut update = {
        let state = app.state::<UpdaterState>();
        let mut runtime = state.0.lock().unwrap();
        match offered {
            Some(update) if runtime.model.offer(&update.version) => { emit(app, &runtime); update }
            _ => { runtime.model.finish_check(); emit(app, &runtime); return Ok(()); }
        }
    };
    update.timeout = Some(Duration::from_secs(30 * 60));
    let mut received = 0u64;
    // download()는 minisign 서명 확인까지 성공해야 bytes를 반환한다. install()은 Exit에서만 부른다.
    let bytes = update.download(|chunk, total| {
        received = received.saturating_add(chunk as u64);
        let percent = total.filter(|total| *total > 0).map_or(0, |total| received.saturating_mul(100).checked_div(total).unwrap_or(0).min(100) as u8);
        let state = app.state::<UpdaterState>();
        let mut runtime = state.0.lock().unwrap();
        if runtime.model.progress(percent) { emit(app, &runtime); }
    }, || {}).await.map_err(|e| format!("업데이트 파일을 받거나 서명을 확인하지 못했어요: {e}"))?;

    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("update");
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || stage(&app, update, bytes, cache)).await.map_err(|e| e.to_string())?
}

fn stage(app: &AppHandle, update: Update, bytes: Vec<u8>, cache: PathBuf) -> Result<(), String> {
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let temporary = cache.join(format!("{}.part", uuid::Uuid::new_v4()));
    let path = cache.join(format!("U3-{}.app.tar.gz", update.version));
    let result = (|| {
        fs::write(&temporary, &bytes).map_err(|e| e.to_string())?;
        let state = app.state::<UpdaterState>();
        let mut runtime = state.0.lock().unwrap();
        if runtime.model.stopped { return Ok(()); }
        fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
        runtime.model.prepared(update.version.clone());
        let old = runtime.prepared.replace(Prepared { update, path });
        emit(app, &runtime);
        if let Some(old) = old { let _ = fs::remove_file(old.path); }
        Ok(())
    })();
    let _ = fs::remove_file(temporary);
    result
}

#[tauri::command]
pub fn update_status(state: State<'_, UpdaterState>) -> Snapshot {
    state.0.lock().unwrap().model.snapshot.clone()
}

#[tauri::command]
pub fn update_check_now(app: AppHandle) -> Snapshot {
    check(&app, Reason::Manual);
    update_status(app.state())
}

#[tauri::command]
pub fn update_restart(app: AppHandle) -> Result<(), String> {
    if cfg!(debug_assertions) { return Err("개발 빌드에서는 업데이트를 적용하지 않아요.".into()); }
    {
        let state = app.state::<UpdaterState>();
        let mut runtime = state.0.lock().unwrap();
        if runtime.prepared.is_none() { return Err("다시 시작할 업데이트가 없어요.".into()); }
        runtime.model.stop();
    }
    // request_restart()는 Exit 콜백이 끝난 뒤 새 실행 파일을 연다.
    app.request_restart();
    Ok(())
}

pub fn stop(app: &AppHandle) {
    app.state::<UpdaterState>().0.lock().unwrap().model.stop();
}

/// 엔진을 종료한 RunEvent::Exit에서만 실행한다. 실행 중인 번들은 바꾸지 않는다.
pub fn install_on_exit(app: &AppHandle) {
    if cfg!(debug_assertions) { return; }
    let prepared = app.state::<UpdaterState>().0.lock().unwrap().prepared.take();
    let Some(prepared) = prepared else { return; };
    let result = (|| {
        let bytes = fs::read(&prepared.path).map_err(|e| e.to_string())?;
        // updater 2.14의 install()은 캐시 bytes의 서명과 서명된 버전을 다시 확인한다.
        prepared.update.install(&bytes).map_err(|e| e.to_string())?;
        fs::remove_file(&prepared.path).map_err(|e| e.to_string())
    })();
    if let Err(error) = result { eprintln!("업데이트를 설치하지 못했습니다: {error}"); }
}
