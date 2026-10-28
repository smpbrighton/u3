use std::{io, os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle}, process::Child};
use windows::{core::PCWSTR, Win32::{Foundation::HANDLE, System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
}}};

// OwnedHandle은 Send + Sync이며 앱이 강제 종료돼도 커널이 Job handle을 닫는다.
pub struct EngineJob { _handle: OwnedHandle }
impl EngineJob {
    pub fn new(child: &Child) -> io::Result<Self> {
        let result = (|| -> windows::core::Result<Self> { unsafe {
            let handle = CreateJobObjectW(None, PCWSTR::null())?;
            let owned = OwnedHandle::from_raw_handle(handle.0);
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(handle, JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(), std::mem::size_of_val(&limits) as u32)?;
            AssignProcessToJobObject(handle, HANDLE(child.as_raw_handle()))?;
            Ok(Self { _handle: owned })
        } })();
        result.map_err(|error| io::Error::other(error.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Command, Stdio};
    use windows::Win32::{Foundation::WAIT_OBJECT_0, System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE}};

    #[test]
    fn closing_job_terminates_node_and_its_descendant() {
        let node = std::env::var_os("U3_TEST_NODE").expect("Windows CI가 staged Node를 지정해야 합니다");
        let code = "process.stdin.once('data',()=>{const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)});process.stdin.resume()";
        let mut child = Command::new(node).args(["-e", code]).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        let job = EngineJob::new(&child).unwrap();
        child.stdin.as_mut().unwrap().write_all(b"ready\n").unwrap();
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap()).read_line(&mut line).unwrap();
        let pid = line.trim().parse::<u32>().unwrap();
        unsafe {
            let descendant = OpenProcess(PROCESS_SYNCHRONIZE, false, pid).unwrap();
            let _owned = OwnedHandle::from_raw_handle(descendant.0);
            drop(job);
            assert_eq!(WaitForSingleObject(HANDLE(child.as_raw_handle()), 5000), WAIT_OBJECT_0);
            assert_eq!(WaitForSingleObject(descendant, 5000), WAIT_OBJECT_0);
        }
        child.wait().unwrap();
    }
}
