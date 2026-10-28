use std::{fs, io::{Read, Write}, os::windows::{ffi::OsStrExt, io::{FromRawHandle, OwnedHandle}}, path::Path};
use ::windows::{core::{PCWSTR, PWSTR}, Win32::{
    Foundation::{HANDLE, HLOCAL, LocalFree},
    Security::{GetTokenInformation, SetFileSecurityW, TokenUser, TOKEN_QUERY, TOKEN_USER,
        PSECURITY_DESCRIPTOR, DACL_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION,
        Authorization::{ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1},
        Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN}},
    Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH},
    System::Threading::{GetCurrentProcess, OpenProcessToken},
}};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
fn wide(path: &Path) -> Vec<u16> { path.as_os_str().encode_wide().chain(Some(0)).collect() }

fn current_sid() -> Result<String> { unsafe {
    let mut token = HANDLE::default();
    OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token)?;
    let _owned = OwnedHandle::from_raw_handle(token.0);
    let mut length = 0;
    let _ = GetTokenInformation(token, TokenUser, None, 0, &mut length);
    if length == 0 { return Err("token".into()); }
    // TOKEN_USER를 읽을 때 포인터 정렬을 유지한다.
    let mut storage = vec![0usize; (length as usize).div_ceil(std::mem::size_of::<usize>())];
    GetTokenInformation(token, TokenUser, Some(storage.as_mut_ptr().cast()), length, &mut length)?;
    let user = &*storage.as_ptr().cast::<TOKEN_USER>();
    let mut text = PWSTR::null();
    ConvertSidToStringSidW(user.User.Sid, &mut text)?;
    let result = text.to_string();
    let _ = LocalFree(Some(HLOCAL(text.0.cast())));
    Ok(result?)
} }

fn restrict(path: &Path, sid: &str, directory: bool) -> Result<()> { unsafe {
    let inheritance = if directory { "OICI" } else { "" };
    let sddl: Vec<u16> = format!("D:P(A;{inheritance};FA;;;{sid})").encode_utf16().chain(Some(0)).collect();
    let mut descriptor = PSECURITY_DESCRIPTOR::default();
    ConvertStringSecurityDescriptorToSecurityDescriptorW(PCWSTR(sddl.as_ptr()), SDDL_REVISION_1, &mut descriptor, None)?;
    let result = SetFileSecurityW(PCWSTR(wide(path).as_ptr()), DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, descriptor).ok();
    let _ = LocalFree(Some(HLOCAL(descriptor.0)));
    Ok(result?)
} }

fn crypt(input: &mut [u8], protect: bool) -> Result<Vec<u8>> { unsafe {
    let data = CRYPT_INTEGER_BLOB { cbData: input.len().try_into()?, pbData: input.as_mut_ptr() };
    let mut output = CRYPT_INTEGER_BLOB::default();
    if protect {
        CryptProtectData(&data, PCWSTR::null(), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)?;
    } else {
        CryptUnprotectData(&data, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)?;
    }
    if output.pbData.is_null() || output.cbData == 0 {
        if !output.pbData.is_null() { let _ = LocalFree(Some(HLOCAL(output.pbData.cast()))); }
        return Err("empty data".into());
    }
    let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
    std::ptr::write_bytes(output.pbData, 0, output.cbData as usize);
    let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
    Ok(result)
} }

fn valid_key(key: &[u8]) -> bool {
    std::str::from_utf8(key).is_ok_and(|text| !text.is_empty() && text.chars().count() <= 4000 && !text.chars().any(|c| c.is_control()))
}

pub fn run() -> Result<i32> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 { return Err("arguments".into()); }
    let path = Path::new(&args[1]);
    if !path.is_absolute() { return Err("path".into()); }
    match args[0].to_str() {
        Some("read") => {
            let mut encrypted = match fs::read(path) {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(44),
                Err(error) => return Err(error.into()),
            };
            if encrypted.len() > 65_536 { return Err("size".into()); }
            let mut key = crypt(&mut encrypted, false)?;
            let result: Result<()> = if valid_key(&key) { std::io::stdout().write_all(&key).map_err(Into::into) } else { Err("key".into()) };
            key.fill(0);
            result?;
        }
        Some("write") => {
            let mut key = Vec::new();
            std::io::stdin().take(16_001).read_to_end(&mut key)?;
            if key.len() > 16_000 || !valid_key(&key) { key.fill(0); return Err("key".into()); }
            let encrypted = crypt(&mut key, true);
            key.fill(0);
            let encrypted = encrypted?;
            let parent = path.parent().ok_or("path")?;
            fs::create_dir_all(parent)?;
            if fs::symlink_metadata(parent)?.file_type().is_symlink() { return Err("path".into()); }
            let sid = current_sid()?;
            restrict(parent, &sid, true)?;
            let temporary = parent.join(format!("jev-{}-{}.tmp", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos()));
            let result = (|| -> Result<()> {
                let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
                restrict(&temporary, &sid, false)?;
                file.write_all(&encrypted)?;
                file.sync_all()?;
                drop(file);
                unsafe { MoveFileExW(PCWSTR(wide(&temporary).as_ptr()), PCWSTR(wide(path).as_ptr()), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)?; }
                Ok(())
            })();
            let _ = fs::remove_file(temporary);
            result?;
        }
        Some("delete") => match fs::remove_file(path) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(44),
            Err(error) => return Err(error.into()),
        },
        _ => return Err("operation".into()),
    }
    Ok(0)
}
