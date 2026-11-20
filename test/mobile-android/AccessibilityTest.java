package dev.gpuix.a11ytest;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;

public final class AccessibilityTest extends Instrumentation {
    private String target;

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        target = arguments.getString("target", "dev.gpuix.svelte.mobilecounter");
        start();
    }

    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String label, String role) {
        if (node == null) return null;
        CharSequence text = node.getText();
        CharSequence description = node.getContentDescription();
        boolean matches = label.contentEquals(text == null ? "" : text)
                || label.contentEquals(description == null ? "" : description);
        if (matches && (role == null || role.contentEquals(node.getClassName()))) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = find(node.getChild(i), label, role);
            if (found != null) return found;
        }
        return null;
    }

    private AccessibilityNodeInfo await(UiAutomation automation, String label, String role) {
        long deadline = SystemClock.uptimeMillis() + 15000;
        do {
            AccessibilityNodeInfo node = find(automation.getRootInActiveWindow(), label, role);
            if (node != null) return node;
            SystemClock.sleep(100);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Missing native accessibility node: " + label + " / " + role);
    }

    private void activate(UiAutomation automation, String label) {
        AccessibilityNodeInfo button = await(automation, label, "android.widget.Button");
        Rect bounds = new Rect();
        button.getBoundsInScreen(bounds);
        if (bounds.isEmpty()) throw new AssertionError("Empty button bounds: " + label);
        if (!button.getActionList().contains(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK)) {
            throw new AssertionError("No accessibility click action: " + label);
        }
        if (!button.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            throw new AssertionError("Accessibility activation refused: " + label);
        }
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            UiAutomation automation = getUiAutomation();
            Intent launch = new Intent().setClassName(target, "dev.gpuix.mobile.MainActivity");
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            await(automation, "Mobile counter", "android.view.View");
            await(automation, "Filesystem passed", "android.widget.TextView");
            await(automation, "0", "android.widget.TextView");
            activate(automation, "+");
            await(automation, "1", "android.widget.TextView");
            activate(automation, "−");
            await(automation, "0", "android.widget.TextView");
            activate(automation, "+");
            await(automation, "1", "android.widget.TextView");
            activate(automation, "Reset");
            await(automation, "0", "android.widget.TextView");
            activate(automation, "Check clipboard");
            await(automation, "Clipboard passed", "android.widget.TextView");
            activate(automation, "Open file");
            await(automation, "Recent", "android.widget.TextView");
            automation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);
            await(automation, "File selection cancelled", "android.widget.TextView");
            activate(automation, "Open file");
            AccessibilityNodeInfo document = await(automation, "gpuix-picker.txt", null);
            AccessibilityNodeInfo clickable = document;
            while (clickable != null && !clickable.isClickable()) clickable = clickable.getParent();
            if (clickable == null || !clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                throw new AssertionError("Could not select the fixture in the system picker");
            }
            await(automation, "Imported: hello-picker", "android.widget.TextView");
            AccessibilityNodeInfo input = await(automation, "Accessible input", null);
            if (!input.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new AssertionError("Input accessibility activation refused");
            await(automation, "Input focused", "android.widget.TextView");
            activate(automation, "Open website");
            long browserDeadline = SystemClock.uptimeMillis() + 15000;
            boolean external = false;
            while (SystemClock.uptimeMillis() < browserDeadline) {
                AccessibilityNodeInfo root = automation.getRootInActiveWindow();
                if (root != null && root.getPackageName() != null && !target.contentEquals(root.getPackageName())) {
                    external = true;
                    break;
                }
                SystemClock.sleep(100);
            }
            if (!external) throw new AssertionError("URL launch did not open another app");
            result.putString("stream", "PASS: native accessibility labels, roles, bounds, activation, filesystem, clipboard and picker cancellation/import and URL launch\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL: " + android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
