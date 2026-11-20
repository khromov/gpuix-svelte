#include <jni.h>
#include <tjs.h>
#include <pthread.h>
#include <android/log.h>
#include <string.h>
#include <limits.h>

/* JNI references and engine values never leave the native invocation's owner thread. */
static _Thread_local JNIEnv *owner_env;
static _Thread_local jobject owner_activity;
static _Thread_local jmethodID exchange_method;
static _Thread_local jmethodID closed_method;
static _Thread_local TJSRuntime *owner_runtime;
static _Thread_local int requested_exit;
static pthread_mutex_t runtime_lock = PTHREAD_MUTEX_INITIALIZER;
static int initialized;

static JSValue java_error(JSContext *ctx) {
    (*owner_env)->ExceptionDescribe(owner_env);
    (*owner_env)->ExceptionClear(owner_env);
    TJS_Stop(owner_runtime);
    return JS_ThrowInternalError(ctx, "GPUI bridge closed or Java call failed");
}

static JSValue exchange(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self;
    if (argc != 1) return JS_ThrowTypeError(ctx, "Expected one JSON request");
    size_t length;
    const uint16_t *text = JS_ToCStringLenUTF16(ctx, &length, argv[0]);
    if (!text) return JS_EXCEPTION;
    if (length > 8 * 1024 * 1024) {
        JS_FreeCStringUTF16(ctx, text);
        return JS_ThrowRangeError(ctx, "Renderer request too large");
    }
    jstring request = (*owner_env)->NewString(owner_env, (const jchar *)text, (jsize)length);
    JS_FreeCStringUTF16(ctx, text);
    if (!request) return java_error(ctx);
    jstring reply = (*owner_env)->CallObjectMethod(owner_env, owner_activity, exchange_method, request);
    (*owner_env)->DeleteLocalRef(owner_env, request);
    if ((*owner_env)->ExceptionCheck(owner_env)) return java_error(ctx);
    if (!reply) return JS_ThrowInternalError(ctx, "Missing GPUI reply");
    const jchar *chars = (*owner_env)->GetStringChars(owner_env, reply, NULL);
    if (!chars) {
        (*owner_env)->DeleteLocalRef(owner_env, reply);
        return java_error(ctx);
    }
    jsize count = (*owner_env)->GetStringLength(owner_env, reply);
    JSValue result = JS_NewStringUTF16(ctx, (const uint16_t *)chars, count);
    (*owner_env)->ReleaseStringChars(owner_env, reply, chars);
    (*owner_env)->DeleteLocalRef(owner_env, reply);
    return result;
}

static JSValue check_closed(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self; (void)argc; (void)argv;
    jboolean closed = (*owner_env)->CallBooleanMethod(owner_env, owner_activity, closed_method);
    if ((*owner_env)->ExceptionCheck(owner_env)) return java_error(ctx);
    if (closed) TJS_Stop(owner_runtime);
    return JS_NewBool(ctx, closed);
}

static JSValue stop_runtime(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self;
    int code = 0;
    if (argc && JS_ToInt32(ctx, &code, argv[0]) < 0) return JS_EXCEPTION;
    requested_exit = code;
    TJS_Stop(owner_runtime);
    return JS_UNDEFINED;
}

JNIEXPORT jint JNICALL Java_dev_gpuix_txikidemo_MainActivity_runRuntime(JNIEnv *env, jobject activity, jstring entry) {
    pthread_mutex_lock(&runtime_lock);
    owner_env = env;
    owner_activity = activity;
    jclass cls = (*env)->GetObjectClass(env, activity);
    exchange_method = (*env)->GetMethodID(env, cls, "exchange", "(Ljava/lang/String;)Ljava/lang/String;");
    closed_method = (*env)->GetMethodID(env, cls, "isRuntimeClosed", "()Z");
    (*env)->DeleteLocalRef(env, cls);
    int result = 1;
    if (!exchange_method || !closed_method || (*env)->ExceptionCheck(env)) goto done;
    const char *path = (*env)->GetStringUTFChars(env, entry, NULL);
    if (!path) goto done;
    if (!initialized) {
        char *argv[] = { "tjs", "run", (char *)path, NULL };
        TJS_Initialize(3, argv);
        initialized = 1;
    }
    (*env)->ReleaseStringUTFChars(env, entry, path);
    TJSRunOptions options;
    TJS_DefaultOptions(&options);
    options.mem_limit = 128 * 1024 * 1024;
    requested_exit = 0;
    owner_runtime = TJS_NewRuntimeOptions(&options);
    if (!owner_runtime) goto done;
    JSContext *ctx = TJS_GetJSContext(owner_runtime);
    JSValue global = JS_GetGlobalObject(ctx);
    if (JS_SetPropertyStr(ctx, global, "__gpuixCall", JS_NewCFunction(ctx, exchange, "__gpuixCall", 1)) < 0 ||
        JS_SetPropertyStr(ctx, global, "__gpuixClosed", JS_NewCFunction(ctx, check_closed, "__gpuixClosed", 0)) < 0 ||
        JS_SetPropertyStr(ctx, global, "__gpuixStop", JS_NewCFunction(ctx, stop_runtime, "__gpuixStop", 1)) < 0) {
        JS_FreeValue(ctx, global);
        TJS_FreeRuntime(owner_runtime);
        goto done;
    }
    JS_FreeValue(ctx, global);
    result = TJS_Run(owner_runtime);
    if (requested_exit) result = requested_exit;
    TJS_FreeRuntime(owner_runtime);
done:
    owner_runtime = NULL;
    owner_env = NULL;
    owner_activity = NULL;
    pthread_mutex_unlock(&runtime_lock);
    return result;
}
