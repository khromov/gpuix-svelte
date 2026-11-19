use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::{Arc, Mutex}};

type PromptResult = Result<Option<Vec<String>>, String>;
#[derive(Default)]
pub struct Prompts(Arc<Mutex<HashMap<u64, Option<PromptResult>>>>, Mutex<HashMap<u64, (usize, Vec<u8>)>>);

#[derive(Deserialize)]
pub struct Request {
    method: String,
    args: Vec<Value>,
}

pub fn dispatch(renderer: &gpuix_core::EmbeddedRenderer, events: &Mutex<Vec<gpuix_core::EventPayload>>, prompts: &Prompts, request: Request) -> anyhow::Result<Value> {
    let a = &request.args;
    let arg = |i: usize| -> anyhow::Result<Value> { a.get(i).cloned().ok_or_else(|| anyhow::anyhow!("Missing argument {i}")) };
    let number = |i| -> anyhow::Result<f64> {
        arg(i)?.as_f64().filter(|n| n.is_finite()).ok_or_else(|| anyhow::anyhow!("Invalid number {i}"))
    };
    let boolean = |i| -> anyhow::Result<bool> {
        arg(i)?.as_bool().ok_or_else(|| anyhow::anyhow!("Invalid boolean {i}"))
    };
    let string = |i| -> anyhow::Result<String> {
        arg(i)?.as_str().map(str::to_owned).ok_or_else(|| anyhow::anyhow!("Invalid string {i}"))
    };
    let bytes = |i: usize| -> anyhow::Result<Vec<u8>> {
        serde_json::from_value(arg(i)?).map_err(|error| anyhow::anyhow!("Invalid bytes {i}: {error}"))
    };
    let r = renderer;
    Ok(match request.method.as_str() {
        "paths" => crate::paths()?,
        "fs" => json!(crate::fs::dispatch(arg(0)?.to_string())),
        "beginUpload" => {
            let id = arg(0)?.as_u64().ok_or_else(|| anyhow::anyhow!("Invalid upload id"))?;
            let length = arg(1)?.as_u64().filter(|n| *n <= 256 * 1024 * 1024).ok_or_else(|| anyhow::anyhow!("Upload exceeds 256 MiB"))? as usize;
            let mut uploads = prompts.1.lock().unwrap();
            if !uploads.is_empty() { anyhow::bail!("Upload already in progress"); }
            uploads.insert(id, (length, Vec::new()));
            Value::Null
        }
        "uploadChunk" => {
            let id = arg(0)?.as_u64().ok_or_else(|| anyhow::anyhow!("Invalid upload id"))?;
            let chunk = bytes(1)?;
            let mut uploads = prompts.1.lock().unwrap();
            let (length, data) = uploads.get_mut(&id).ok_or_else(|| anyhow::anyhow!("Unknown upload"))?;
            if chunk.len() > 64 * 1024 || data.len() + chunk.len() > *length { anyhow::bail!("Invalid upload chunk"); }
            data.extend(chunk);
            Value::Null
        }
        "cancelUpload" => {
            if let Some(id) = arg(0)?.as_u64() { prompts.1.lock().unwrap().remove(&id); }
            Value::Null
        }
        "finishUpload" => {
            let id = arg(0)?.as_u64().ok_or_else(|| anyhow::anyhow!("Invalid upload id"))?;
            let (length, data) = prompts.1.lock().unwrap().remove(&id).ok_or_else(|| anyhow::anyhow!("Unknown upload"))?;
            if data.len() != length { anyhow::bail!("Incomplete upload"); }
            match string(1)?.as_str() {
                "image" => r.set_image_bytes(number(2)?, data)?,
                "pixels" => r.set_image_pixels_bytes(number(2)?, number(3)?, number(4)?, data, serde_json::from_value(arg(5)?)?)?,
                "font" => r.register_font_bytes(data)?,
                _ => anyhow::bail!("Unknown upload type"),
            }
            Value::Null
        }
        "init" => { r.init(serde_json::from_value(arg(0)?)?)?; Value::Null }
        "isInitialized" => json!(r.is_initialized()),
        "applyBatch" => json!(r.apply_batch(string(0)?)?),
        "tick" => json!({ "running": r.tick()?, "events": std::mem::take(&mut *events.lock().unwrap()) }),
        "getWindowSize" => serde_json::to_value(r.get_window_size()?)?,
        "getWindowInsets" => serde_json::to_value(r.get_window_insets()?)?,
        "setWindowKeyEvents" => { r.set_window_key_events(boolean(0)?, boolean(1)?, number(2)?)?; Value::Null }
        "setWindowSelectionChange" => { r.set_window_selection_change(boolean(0)?, number(1)?)?; Value::Null }
        "getFocusedElementId" => json!(r.get_focused_element_id()?),
        "focusElement" => { r.focus_element(number(0)?)?; Value::Null }
        "focusNext" => { r.focus_next()?; Value::Null }
        "focusPrevious" => { r.focus_previous()?; Value::Null }
        "focusNextWithin" => { r.focus_next_within(number(0)?)?; Value::Null }
        "focusPreviousWithin" => { r.focus_previous_within(number(0)?)?; Value::Null }
        "blur" => { r.blur()?; Value::Null }
        "getElementBounds" => serde_json::to_value(r.get_element_bounds(number(0)?)?)?,
        "getElementsAt" => json!(r.get_elements_at(number(0)?, number(1)?)?),
        "getAutomationTree" => json!(r.get_automation_tree()?),
        "getSelectedText" => json!(r.get_selected_text()),
        "clearSelection" => { r.clear_selection()?; Value::Null }
        "scrollTo" => { r.scroll_to(number(0)?, number(1)?, number(2)?)?; Value::Null }
        "getScrollOffset" => json!(r.get_scroll_offset(number(0)?)?),
        "scrollIntoView" => { r.scroll_into_view(number(0)?)?; Value::Null }
        "scrollToItem" => { r.scroll_to_item(number(0)?, number(1)?, arg(2)?.as_f64())?; Value::Null }
        "getListScrollTop" => json!(r.get_list_scroll_top(number(0)?)?),
        "beginPrompt" => {
            let id = arg(0)?.as_u64().ok_or_else(|| anyhow::anyhow!("Invalid prompt id"))?;
            let options = serde_json::from_value(arg(1)?)?;
            {
                let mut pending = prompts.0.lock().map_err(|_| anyhow::anyhow!("Prompt lock poisoned"))?;
                if !pending.is_empty() { anyhow::bail!("A file picker is already open"); }
                pending.insert(id, None);
            }
            let pending = prompts.0.clone();
            r.prompt_for_paths_with(options, move |result| {
                if let Ok(mut pending) = pending.lock() {
                    if let Some(slot) = pending.get_mut(&id) { *slot = Some(result.map_err(|error| error.to_string())); }
                }
            });
            Value::Null
        }
        "pollPrompt" => {
            let id = arg(0)?.as_u64().ok_or_else(|| anyhow::anyhow!("Invalid prompt id"))?;
            let mut pending = prompts.0.lock().map_err(|_| anyhow::anyhow!("Prompt lock poisoned"))?;
            match pending.get(&id) {
                None => anyhow::bail!("Unknown prompt id"),
                Some(None) => json!({ "done": false }),
                Some(Some(_)) => match pending.remove(&id).unwrap().unwrap() {
                    Ok(value) => json!({ "done": true, "value": value }),
                    Err(error) => anyhow::bail!(error),
                },
            }
        }
        "setImage" => { r.set_image_bytes(number(0)?, bytes(1)?)?; Value::Null }
        "setImagePixels" => { r.set_image_pixels_bytes(number(0)?, number(1)?, number(2)?, bytes(3)?, serde_json::from_value(arg(4)?)?)?; Value::Null }
        "registerFont" => { r.register_font_bytes(bytes(0)?)?; Value::Null }
        "openUrl" => { gpuix_core::open_url(&string(0)?)?; Value::Null }
        "readClipboardText" => json!(gpuix_core::read_clipboard_text()?),
        "writeClipboardText" => { gpuix_core::write_clipboard_text(&string(0)?)?; Value::Null }
        "setWindowTitle" => { r.set_window_title(string(0)?)?; Value::Null }
        "activateWindow" => { r.activate_window()?; Value::Null }
        "minimizeWindow" => { r.minimize_window()?; Value::Null }
        "zoomWindow" => { r.zoom_window()?; Value::Null }
        "toggleFullscreen" => { r.toggle_fullscreen()?; Value::Null }
        "setDebugFrameOverlay" => json!(r.set_debug_frame_overlay(string(0)?)?),
        "cycleDebugFrameOverlay" => json!(r.cycle_debug_frame_overlay()?),
        "getDebugFrameOverlay" => json!(r.get_debug_frame_overlay()?),
        "resetDebugFrameOverlayStats" => { r.reset_debug_frame_overlay_stats()?; Value::Null }
        "getDebugFrameOverlayStats" => r.get_debug_frame_overlay_stats()?,
        method => anyhow::bail!("Unsupported txiki GPUI method: {method}"),
    })
}
