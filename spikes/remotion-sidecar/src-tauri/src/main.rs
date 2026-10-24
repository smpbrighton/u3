use std::fs::File;
use std::process::{Command, Stdio};

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            let output = std::env::var("U3_SPIKE_OUTPUT")
                .unwrap_or_else(|_| "/tmp/u3-remotion-sidecar-result.mp4".to_string());
            let executable = std::env::current_exe()?;
            let sidecar = executable.parent().unwrap().join("remotion-sidecar");
            let log_path = std::env::var("U3_SPIKE_LOG")
                .unwrap_or_else(|_| "/tmp/u3-remotion-sidecar-launch.log".to_string());
            let log = File::create(log_path)?;
            Command::new(sidecar)
                .env("U3_SPIKE_OUTPUT", output)
                .env("HOME", "/tmp")
                .env("PATH", "/usr/bin:/bin")
                .stdout(Stdio::from(log.try_clone()?))
                .stderr(Stdio::from(log))
                .spawn()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tauri app failed");
}
