use std::{path::Path, io::{Read, Write, Seek, SeekFrom}, time::UNIX_EPOCH};
use std::os::unix::{ffi::OsStrExt, fs::{DirBuilderExt, FileTypeExt, MetadataExt, OpenOptionsExt}};

fn kind(t: std::fs::FileType) -> &'static str {
    if t.is_symlink() { "symlink" } else if t.is_dir() { "directory" } else if t.is_file() { "file" }
    else if t.is_block_device() { "block" } else if t.is_char_device() { "character" }
    else if t.is_fifo() { "fifo" } else if t.is_socket() { "socket" } else { "other" }
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> f64 {
    time.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

pub fn dispatch(request: String) -> String {
    type FsError = (String, String, String, String, i32, Option<String>);
    let result = (|| -> std::result::Result<serde_json::Value, FsError> {
        let req: serde_json::Value = serde_json::from_str(&request).map_err(|e| {
            (
                "EINVAL".into(),
                "fs".into(),
                String::new(),
                e.to_string(),
                -22,
                None,
            )
        })?;
        let op = req["op"].as_str().unwrap_or("fs");
        let path = req["path"].as_str().unwrap_or("");
        let p = Path::new(path);
        let ioerr = |e: std::io::Error| {
            let code = match e.kind() {
                std::io::ErrorKind::NotFound => "ENOENT",
                std::io::ErrorKind::PermissionDenied => "EACCES",
                std::io::ErrorKind::AlreadyExists => "EEXIST",
                std::io::ErrorKind::InvalidInput => "EINVAL",
                std::io::ErrorKind::NotADirectory => "ENOTDIR",
                std::io::ErrorKind::IsADirectory => "EISDIR",
                std::io::ErrorKind::DirectoryNotEmpty => "ENOTEMPTY",
                _ => "EIO",
            };
            let errno = match code {
                "ENOENT" => -2,
                "EACCES" => -13,
                "EEXIST" => -17,
                "EINVAL" => -22,
                "ENOTDIR" => -20,
                "EISDIR" => -21,
                "ENOTEMPTY" => e.raw_os_error().map(|n| -n.abs()).unwrap_or(-39),
                _ => e.raw_os_error().map(|n| -n.abs()).unwrap_or(-5),
            };
            let syscall = match op {
                "read" => "open",
                "write" => "open",
                "readdir" => "scandir",
                "copy" => "copyfile",
                "realpath" => "realpath",
                "access" => "access",
                "rm" if req["recursive"].as_bool().unwrap_or(false) => "rmdir",
                "rm" => "unlink",
                "stat" => "stat",
                "lstat" => "lstat",
                other => other,
            };
            (
                code.to_string(),
                syscall.to_string(),
                path.to_string(),
                e.to_string(),
                errno,
                None,
            )
        };
        let value = match op {
            "read" => {
                let mut file = std::fs::File::open(p).map_err(ioerr)?;
                file.seek(SeekFrom::Start(req["offset"].as_u64().unwrap_or(0))).map_err(ioerr)?;
                let mut bytes = Vec::new();
                file.take(64 * 1024).read_to_end(&mut bytes).map_err(ioerr)?;
                serde_json::json!(bytes)
            }
            "write" => {
                let bytes: Vec<u8> = req["data"]
                    .as_array()
                    .ok_or_else(|| {
                        (
                            "EINVAL".into(),
                            "write".into(),
                            path.into(),
                            "data must be bytes".into(),
                            -22,
                            None,
                        )
                    })?
                    .iter()
                    .map(|v| v.as_u64().unwrap_or(0) as u8)
                    .collect();
                let flag = req["flag"].as_str().unwrap_or("w");
                let mut options = std::fs::OpenOptions::new();
                let offset = req["offset"].as_u64().unwrap_or(0);
                let (create, exclusive, append, truncate) = match flag {
                    "w" | "w+" => (true, false, false, true),
                    "wx" | "wx+" | "xw" | "xw+" => (true, true, false, true),
                    "a" | "a+" => (true, false, true, false),
                    "ax" | "ax+" | "xa" | "xa+" => (true, true, true, false),
                    "r+" => (false, false, false, false),
                    _ => return Err(("EINVAL".into(), "open".into(), path.into(), "unsupported file flag".into(), -22, None)),
                };
                options.write(true)
                    .create(create)
                    .create_new(offset == 0 && exclusive)
                    .truncate(offset == 0 && truncate && !exclusive)
                    .append(append)
                    .mode(req["mode"].as_u64().unwrap_or(0o666) as u32);
                let mut file = options.open(p).map_err(ioerr)?;
                if !append { file.seek(SeekFrom::Start(offset)).map_err(ioerr)?; }
                file.write_all(&bytes).map_err(ioerr)?;
                serde_json::Value::Null
            }
            "mkdtemp" => {
                let template = std::ffi::CString::new(format!("{path}XXXXXX"))
                    .map_err(|_| ioerr(std::io::Error::from(std::io::ErrorKind::InvalidInput)))?;
                let mut bytes = template.into_bytes_with_nul();
                if unsafe { libc::mkdtemp(bytes.as_mut_ptr().cast()) }.is_null() {
                    return Err(ioerr(std::io::Error::last_os_error()));
                }
                bytes.pop();
                serde_json::json!(bytes)
            }
            "mkdir" => {
                let recursive = req["recursive"].as_bool().unwrap_or(false);
                let first = if recursive { p.ancestors().take_while(|p| !p.exists()).last() } else { None };
                std::fs::DirBuilder::new().recursive(recursive)
                    .mode(req["mode"].as_u64().unwrap_or(0o777) as u32).create(p).map_err(ioerr)?;
                first.map(|p| serde_json::json!(p.to_string_lossy())).unwrap_or(serde_json::Value::Null)
            }
            "readdir" => {
                let mut names = Vec::new();
                for entry in std::fs::read_dir(p).map_err(ioerr)? {
                    let entry = entry.map_err(ioerr)?;
                    let name = entry.file_name().as_bytes().to_vec();
                    names.push(if req["withFileTypes"].as_bool().unwrap_or(false) {
                        serde_json::json!({ "name": name, "kind": kind(entry.file_type().map_err(ioerr)?) })
                    } else { serde_json::json!(name) });
                }
                serde_json::json!(names)
            }
            "stat" | "lstat" => {
                let m = if op == "lstat" {
                    std::fs::symlink_metadata(p)
                } else {
                    std::fs::metadata(p)
                }
                .map_err(ioerr)?;
                serde_json::json!({
                    "kind": kind(m.file_type()), "size": m.len(), "atimeMs": millis(m.accessed()),
                    "mtimeMs": millis(m.modified()), "ctimeMs": m.ctime() as f64 * 1000.0 + m.ctime_nsec() as f64 / 1e6,
                    "birthtimeMs": millis(m.created()), "mode": m.mode(), "uid": m.uid(), "gid": m.gid(),
                    "ino": m.ino(), "dev": m.dev(), "nlink": m.nlink(), "blocks": m.blocks(), "blksize": m.blksize()
                })
            }
            "unlink" => {
                std::fs::remove_file(p).map_err(ioerr)?;
                serde_json::Value::Null
            }
            "rename" => {
                let dest = req["dest"].as_str().unwrap_or("");
                std::fs::rename(p, dest).map_err(|e| {
                    let (code, _, path, msg, errno, _) = ioerr(e);
                    (code, "rename".into(), path, msg, errno, Some(dest.into()))
                })?;
                serde_json::Value::Null
            }
            "copy" => {
                let dest = req["dest"].as_str().unwrap_or("");
                let copy = || -> std::io::Result<()> {
                    if req["exclusive"].as_bool().unwrap_or(false) {
                        let mut input = std::fs::File::open(p)?;
                        let mut output = std::fs::OpenOptions::new().write(true).create_new(true)
                            .mode(input.metadata()?.mode()).open(dest)?;
                        std::io::copy(&mut input, &mut output)?;
                    } else { std::fs::copy(p, dest)?; }
                    Ok(())
                };
                copy().map_err(|e| {
                    let (code, _, path, msg, errno, _) = ioerr(e);
                    (code, "copyfile".into(), path, msg, errno, Some(dest.into()))
                })?;
                serde_json::Value::Null
            }
            "access" => {
                let mode = req["mode"].as_i64().unwrap_or(0);
                if !(0..=7).contains(&mode) { return Err(ioerr(std::io::Error::from(std::io::ErrorKind::InvalidInput))); }
                let path = std::ffi::CString::new(path).map_err(|_| ioerr(std::io::Error::from(std::io::ErrorKind::InvalidInput)))?;
                if unsafe { libc::access(path.as_ptr(), mode as i32) } != 0 { return Err(ioerr(std::io::Error::last_os_error())); }
                serde_json::Value::Null
            }
            "realpath" => serde_json::json!(std::fs::canonicalize(p)
                .map_err(ioerr)?
                .to_string_lossy()
                .into_owned()),
            "rmdir" => {
                if req["recursive"].as_bool().unwrap_or(false) {
                    std::fs::remove_dir_all(p).map_err(ioerr)?;
                } else {
                    std::fs::remove_dir(p).map_err(ioerr)?;
                }
                serde_json::Value::Null
            }
            "rm" => {
                let force = req["force"].as_bool().unwrap_or(false);
                let recursive = req["recursive"].as_bool().unwrap_or(false);
                let removal = match std::fs::symlink_metadata(p) {
                    Ok(m) if recursive && m.is_dir() && !m.file_type().is_symlink() => {
                        std::fs::remove_dir_all(p)
                    }
                    Ok(m) if m.is_dir() && !m.file_type().is_symlink() => {
                        return Err(("ERR_FS_EISDIR".into(), "rm".into(), path.into(), "Path is a directory".into(), 21, None));
                    }
                    Ok(_) => std::fs::remove_file(p),
                    Err(e) => Err(e),
                };
                if let Err(e) = removal {
                    if !(force && e.kind() == std::io::ErrorKind::NotFound) {
                        return Err(ioerr(e));
                    }
                }
                serde_json::Value::Null
            }
            _ => {
                return Err((
                    "ERR_METHOD_NOT_IMPLEMENTED".into(),
                    op.into(),
                    path.into(),
                    format!("fs.{op} is not supported"),
                    -38,
                    None,
                ))
            }
        };
        Ok(value)
    })();
    match result {
        Ok(value) => serde_json::json!({"value":value}).to_string(),
        Err((code, syscall, path, message, errno, dest)) => {
            let message = if let Some(dest) = &dest {
                format!("{code}: {message}, {syscall} '{path}' -> '{dest}'")
            } else {
                format!("{code}: {message}, {syscall} '{path}'")
            };
            serde_json::json!({"error":{"code":code,"errno":errno,"syscall":syscall,"path":path,"dest":dest,"message":message}}).to_string()
        }
    }
}
