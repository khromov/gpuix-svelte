use gpui_mobile::android::jni as platform;
use jni::{objects::{JObject, JValue}, refs::Global};
use serde_json::json;
use std::{sync::{Arc, Mutex}, time::Duration};

struct Session {
    activity: Global<JObject<'static>>,
    renderer: gpuix_core::EmbeddedRenderer,
    events: Arc<Mutex<Vec<gpuix_core::EventPayload>>>,
    prompts: gpuix_svelte_txiki_host::dispatch::Prompts,
}

impl Session {
    fn new() -> Result<Self, String> {
        let activity = platform::with_env(|env| {
            let activity = platform::activity(env)?;
            env.call_method(&activity, jni::jni_str!("startRuntime"), jni::jni_sig!("()V"), &[])
                .map_err(|e| e.to_string())?;
            env.new_global_ref(activity).map_err(|e| e.to_string())
        })?;
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        Ok(Self {
            activity,
            renderer: gpuix_core::EmbeddedRenderer::with_event_callback(Some(Arc::new(move |event| {
                sink.lock().unwrap().push(event);
            }))),
            events,
            prompts: Default::default(),
        })
    }


    fn pump(&self) -> Result<(), String> {
        platform::with_env(|env| {
            let closed = env.call_method(&self.activity, jni::jni_str!("isRuntimeClosed"),
                jni::jni_sig!("()Z"), &[]).and_then(|v| v.z()).map_err(|e| e.to_string())?;
            if closed { return Err("Runtime stopped".into()); }
            let request = env.call_method(&self.activity, jni::jni_str!("pollRequest"),
                jni::jni_sig!("()Ljava/lang/String;"), &[])
                .and_then(|v| v.l()).map_err(|e| e.to_string())?;
            if request.is_null() { return Ok(()); }
            let request = platform::get_string(env, &request);
            let result = (|| -> anyhow::Result<serde_json::Value> {
                let request: gpuix_svelte_txiki_host::dispatch::Request = serde_json::from_str(&request)?;
                if request.method == "finishBack" {
                    env.call_method(&self.activity, jni::jni_str!("finishBack"), jni::jni_sig!("()V"), &[])?;
                    return Ok(serde_json::Value::Null);
                }
                let tick = request.method == "tick";
                let mut result = gpuix_svelte_txiki_host::dispatch::dispatch(&self.renderer, &self.events, &self.prompts, request)?;
                if tick {
                    let back = env.call_method(&self.activity, jni::jni_str!("takeBack"), jni::jni_sig!("()Z"), &[])?.z()?;
                    result["back"] = json!(back);
                }
                Ok(result)
            })();
            let reply = match result {
                Ok(value) => json!({ "value": value }),
                Err(error) => json!({ "error": error.to_string() }),
            };
            let text = env.new_string(reply.to_string()).map_err(|e| e.to_string())?;
            env.call_method(&self.activity, jni::jni_str!("reply"),
                jni::jni_sig!("(Ljava/lang/String;)V"), &[JValue::Object(&text)])
                .map_err(|e| e.to_string())?;
            Ok(())
        })
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = platform::with_env(|env| {
            env.call_method(&self.activity, jni::jni_str!("closeRuntime"),
                jni::jni_sig!("()V"), &[]).map_err(|e| e.to_string())?;
            Ok(())
        });
        log::info!("GPUI txiki session disposed");
    }
}

fn start(cx: &mut gpui::App) {
    gpuix_core::init(cx);
    let app = cx.to_async();
    let task = cx.spawn(async move |cx| {
        gpuix_core::install_host(app);
        let session = match Session::new() {
            Ok(session) => session,
            Err(error) => { log::error!("txiki startup: {error}"); return; }
        };
        loop {
            if let Err(error) = session.pump() {
                log::info!("txiki bridge stopped: {error}");
                break;
            }
            let delay = if cx.update(|cx| cx.active_window().is_some()) { 4 } else { 100 };
            cx.background_executor().timer(Duration::from_millis(delay)).await;
        }
        drop(session);
        cx.update(|cx| cx.quit());
    });
    let mut task = Some(task);
    cx.on_app_quit(move |_| {
        drop(task.take());
        std::future::ready(())
    }).detach();
}

#[no_mangle]
fn android_main(app: android_activity::AndroidApp) {
    android_logger::init_once(android_logger::Config::default().with_max_level(log::LevelFilter::Info));
    platform::install_panic_hook();
    let _platform = platform::init_platform(&app);
    let emulator = platform::with_env(|env| {
        let activity = platform::activity(env)?;
        env.call_method(&activity, jni::jni_str!("isEmulator"), jni::jni_sig!("()Z"), &[])
            .and_then(|v| v.z()).map_err(|e| e.to_string())
    }).unwrap_or(false);
    if emulator { std::env::set_var("GPUIX_ANDROID_EMULATOR", "1"); }
    let platform = platform::shared_platform().expect("Android platform");
    gpui::Application::with_platform(platform.into_rc()).run(start);
}
