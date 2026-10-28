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
