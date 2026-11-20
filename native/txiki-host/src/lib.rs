pub mod dispatch;
mod fs;

pub fn paths() -> anyhow::Result<serde_json::Value> {
    use gpui_mobile::packages::path_provider;
    let data = path_provider::support_directory().map_err(anyhow::Error::msg)?;
    let cache = path_provider::cache_directory().map_err(anyhow::Error::msg)?;
    let documents = path_provider::documents_directory().map_err(anyhow::Error::msg)?;
    let temp = path_provider::temporary_directory().map_err(anyhow::Error::msg)?;
    for path in [&data, &cache, &documents, &temp] { std::fs::create_dir_all(path)?; }
    Ok(serde_json::json!({ "data": data, "cache": cache, "documents": documents, "temp": temp }))
}
