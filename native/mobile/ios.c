#include <tjs.h>
#include <arpa/inet.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

static _Thread_local TJSRuntime *runtime;
static _Thread_local int connection = -1;

static int write_all(const char *data, size_t length) {
    while (length) {
        ssize_t n = send(connection, data, length, 0);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return -1;
        data += n;
        length -= (size_t)n;
    }
    return 0;
}

static JSValue exchange(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self;
    if (argc != 1) return JS_ThrowTypeError(ctx, "Expected a JSON request");
    size_t length;
    const char *request = JS_ToCStringLen(ctx, &length, argv[0]);
    if (!request) return JS_EXCEPTION;
    if (length > 8 * 1024 * 1024 || memchr(request, '\n', length)) {
        JS_FreeCString(ctx, request);
        return JS_ThrowRangeError(ctx, "Invalid renderer request");
    }
    int failed = write_all(request, length) || write_all("\n", 1);
    JS_FreeCString(ctx, request);
    if (failed) return JS_ThrowInternalError(ctx, "GPUI bridge write failed");
    size_t used = 0, capacity = 4096;
    char *reply = malloc(capacity);
    if (!reply) return JS_ThrowOutOfMemory(ctx);
    while (used < 8 * 1024 * 1024) {
        if (used == capacity) {
            capacity *= 2;
            char *next = realloc(reply, capacity);
            if (!next) { free(reply); return JS_ThrowOutOfMemory(ctx); }
            reply = next;
        }
        ssize_t n = recv(connection, reply + used, capacity - used, 0);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) { free(reply); return JS_ThrowInternalError(ctx, "GPUI bridge read failed"); }
        char *end = memchr(reply + used, '\n', (size_t)n);
        used += (size_t)n;
        if (end) {
            JSValue result = JS_NewStringLen(ctx, reply, (size_t)(end - reply));
            free(reply);
            return result;
        }
    }
    free(reply);
    return JS_ThrowRangeError(ctx, "GPUI reply too large");
}

static JSValue check_closed(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)self; (void)argc; (void)argv;
    char byte;
    ssize_t n = recv(connection, &byte, 1, MSG_PEEK | MSG_DONTWAIT);
    int closed = n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR);
    if (closed) TJS_Stop(runtime);
    return JS_NewBool(ctx, closed);
}

static JSValue stop_runtime(JSContext *ctx, JSValueConst self, int argc, JSValueConst *argv) {
    (void)ctx; (void)self; (void)argc; (void)argv;
    TJS_Stop(runtime);
    return JS_UNDEFINED;
}

int txiki_run(const char *entry, const char *portfile) {
    int port = 0;
    char token[65] = {0};
    for (int i = 0; i < 300; i++) {
        FILE *f = fopen(portfile, "r");
        if (f) {
            int parsed = fscanf(f, "%d %64s", &port, token);
            fclose(f);
            if (parsed == 2 && port > 0 && port <= 65535 && strlen(token) == 64) break;
        }
        port = 0;
        usleep(100000);
    }
    if (!port) { fprintf(stderr, "txiki: GPUI bridge did not start\n"); return 1; }
    connection = socket(AF_INET, SOCK_STREAM, 0);
    if (connection < 0) return 1;
    int no_sigpipe = 1;
    setsockopt(connection, SOL_SOCKET, SO_NOSIGPIPE, &no_sigpipe, sizeof(no_sigpipe));
    struct timeval timeout = { .tv_sec = 10 };
    setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    struct sockaddr_in addr = { .sin_family = AF_INET, .sin_port = htons((uint16_t)port) };
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (connect(connection, (struct sockaddr *)&addr, sizeof(addr)) ||
        write_all(token, strlen(token)) || write_all("\n", 1)) {
        perror("txiki: GPUI bridge connection");
        close(connection);
        return 1;
    }
    char *args[] = { "tjs", "run", (char *)entry, NULL };
    TJS_Initialize(3, args);
    TJSRunOptions options;
    TJS_DefaultOptions(&options);
    options.mem_limit = 128 * 1024 * 1024;
    runtime = TJS_NewRuntimeOptions(&options);
    if (!runtime) { close(connection); return 1; }
    JSContext *ctx = TJS_GetJSContext(runtime);
    JSValue global = JS_GetGlobalObject(ctx);
    if (JS_SetPropertyStr(ctx, global, "__gpuixCall", JS_NewCFunction(ctx, exchange, "__gpuixCall", 1)) < 0 ||
        JS_SetPropertyStr(ctx, global, "__gpuixClosed", JS_NewCFunction(ctx, check_closed, "__gpuixClosed", 0)) < 0 ||
        JS_SetPropertyStr(ctx, global, "__gpuixStop", JS_NewCFunction(ctx, stop_runtime, "__gpuixStop", 1)) < 0) {
        JS_FreeValue(ctx, global);
        TJS_FreeRuntime(runtime);
        runtime = NULL;
        close(connection);
        connection = -1;
        return 1;
    }
    JS_FreeValue(ctx, global);
    int result = TJS_Run(runtime);
    TJS_FreeRuntime(runtime);
    runtime = NULL;
    close(connection);
    connection = -1;
    return result;
}
