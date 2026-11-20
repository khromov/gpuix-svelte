package dev.gpuix.mobile;

import android.os.Bundle;
import android.os.Build;
import android.util.Log;
import dev.gpui.mobile.GpuiInputActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

public class MainActivity extends GpuiInputActivity {
    static { System.loadLibrary("txiki_app"); }
    private static final Object RUNTIME_OWNER = new Object();
    private final ArrayBlockingQueue<String> requests = new ArrayBlockingQueue<>(1);
    private final ArrayBlockingQueue<String> replies = new ArrayBlockingQueue<>(1);
    private volatile boolean closed;
    private Thread worker;
    private boolean pendingBack;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::onBackPressed);
        }
    }

    @Override public synchronized void onBackPressed() { pendingBack = true; }
    public synchronized boolean takeBack() {
        boolean pending = pendingBack;
        pendingBack = false;
        return pending;
    }
    public void finishBack() { runOnUiThread(() -> super.onBackPressed()); }

    public boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("sdk_gphone") || Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish");
    }

    private native int runRuntime(String entry);

    public synchronized void startRuntime() {
        if (worker != null || closed) throw new IllegalStateException("Runtime already started or closed");
        File directory = new File(getFilesDir(), "txiki");
        try {
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Cannot create bundle directory");
            for (String name : getAssets().list("")) {
                if (name.equals("main.mjs") || name.equals("app.mjs") || name.startsWith("gpuix-asset-") || name.equals("gpuix-resources")) extractAsset(name, directory);
            }
        } catch (Exception error) {
            closed = true;
            throw new IllegalStateException("Cannot unpack Svelte bundle", error);
        }
        worker = new Thread(() -> {
            synchronized (RUNTIME_OWNER) {
                if (closed) return;
                int result = runRuntime(new File(directory, "main.mjs").getAbsolutePath());
                Log.i("gpuix-txiki", "txiki runtime disposed: " + result);
                closeRuntime();
            }
        }, "txiki-owner");
        worker.start();
    }

    private void extractAsset(String name, File directory) throws Exception {
        String[] children = getAssets().list(name);
        if (children != null && children.length > 0) {
            for (String child : children) extractAsset(name + "/" + child, directory);
            return;
        }
        File destination = new File(directory, name);
        File parent = destination.getParentFile();
        if (!parent.isDirectory() && !parent.mkdirs()) throw new IllegalStateException("Cannot create asset directory");
        try (InputStream input = getAssets().open(name); FileOutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = input.read(buffer)) != -1) output.write(buffer, 0, n);
        }
    }

    public String exchange(String request) {
        if (closed) return "{\"closed\":true}";
        if (request.length() > 8 * 1024 * 1024) throw new IllegalArgumentException("Renderer request too large");
        try {
            if (!requests.offer(request)) throw new IllegalStateException("Renderer already has a pending request");
            String reply = replies.poll(10, TimeUnit.SECONDS);
            if (closed) return "{\"closed\":true}";
            if (reply == null) throw new IllegalStateException("GPUI session timed out");
            return reply;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Renderer exchange interrupted", error);
        } catch (RuntimeException error) {
            closeRuntime();
            throw error;
        }
    }

    public String pollRequest() { return closed ? null : requests.poll(); }
    public void reply(String response) {
        if (!closed && !replies.offer(response)) closeRuntime();
    }
    public boolean isRuntimeClosed() { return closed; }
    public void closeRuntime() {
        closed = true;
        requests.clear();
        replies.offer("{\"error\":\"GPUI session closed\"}");
    }

    @Override protected void onDestroy() {
        closeRuntime();
        super.onDestroy();
    }
}
