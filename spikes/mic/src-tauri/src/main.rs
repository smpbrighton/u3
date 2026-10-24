use std::{fs, path::PathBuf};

const OUTPUT_DIR: &str = "/Volumes/X31/workspace/smp_workspace/u3-spike-cache/mic";

#[tauri::command]
fn write_capture(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let safe_name = PathBuf::from(&filename);
    if safe_name.components().count() != 1 {
        return Err("filename must be a single path component".into());
    }
    fs::create_dir_all(OUTPUT_DIR).map_err(|error| error.to_string())?;
    let path = PathBuf::from(OUTPUT_DIR).join(safe_name);
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn write_result(json: String) -> Result<(), String> {
    fs::create_dir_all(OUTPUT_DIR).map_err(|error| error.to_string())?;
    fs::write(PathBuf::from(OUTPUT_DIR).join("result.json"), json)
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![write_capture, write_result])
        .run(tauri::generate_context!())
        .expect("failed to run U3 Mic Spike");
}
