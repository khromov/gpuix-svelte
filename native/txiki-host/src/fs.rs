use std::{path::Path, io::{Read, Write, Seek, SeekFrom}};

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
                std::io::ErrorKind::NotADirectory => "ENOTDIR",
                std::io::ErrorKind::IsADirectory => "EISDIR",
                _ => "EIO",
            };
            let errno = match code {
                "ENOENT" => -2,
                "EACCES" => -13,
                "EEXIST" => -17,
                "ENOTDIR" => -20,
                "EISDIR" => -21,
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
                let mut bytes = vec![0; 64 * 1024];
                let count = file.read(&mut bytes).map_err(ioerr)?;
                bytes.truncate(count);
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
                options
                    .write(true)
                    .create(true)
                    .truncate(flag != "a" && flag != "a+")
                    .append(flag == "a" || flag == "a+");
                options
                    .open(p)
                    .and_then(|mut f| f.write_all(&bytes))
                    .map_err(ioerr)?;
                serde_json::Value::Null
            }
            "mkdir" => {
                if req["recursive"].as_bool().unwrap_or(false) {
                    std::fs::create_dir_all(p)
                } else {
                    std::fs::create_dir(p)
                }
                .map_err(ioerr)?;
                serde_json::Value::Null
            }
            "readdir" => {
                let mut names = Vec::new();
                for entry in std::fs::read_dir(p).map_err(ioerr)? {
                    names.push(
                        entry
                            .map_err(ioerr)?
                            .file_name()
                            .to_string_lossy()
                            .into_owned(),
                    );
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
                let kind = if m.file_type().is_symlink() {
                    "symlink"
                } else if m.is_dir() {
                    "directory"
                } else if m.is_file() {
                    "file"
                } else {
                    "other"
                };
                serde_json::json!({"kind":kind,"size":m.len(),"isFile":m.is_file(),"isDirectory":m.is_dir()})
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
                std::fs::copy(p, dest).map_err(|e| {
                    let (code, _, path, msg, errno, _) = ioerr(e);
                    (code, "copyfile".into(), path, msg, errno, Some(dest.into()))
                })?;
                serde_json::Value::Null
            }
            "access" => {
                std::fs::metadata(p).map_err(ioerr)?;
                serde_json::Value::Null
            }
            "realpath" => serde_json::json!(std::fs::canonicalize(p)
                .map_err(ioerr)?
                .to_string_lossy()
                .into_owned()),
            "rm" => {
                let force = req["force"].as_bool().unwrap_or(false);
                let recursive = req["recursive"].as_bool().unwrap_or(false);
                let removal = match std::fs::symlink_metadata(p) {
                    Ok(m) if recursive && m.is_dir() && !m.file_type().is_symlink() => {
                        std::fs::remove_dir_all(p)
                    }
                    Ok(m) if m.is_dir() && !m.file_type().is_symlink() => std::fs::remove_dir(p),
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
