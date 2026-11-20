import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'gpuix-android-accessibility-'));
const target = process.env.GPUIX_ANDROID_APP_ID ?? 'dev.gpuix.svelte.mobilecounter';
const adb = process.env.ADB ?? 'adb';
const serial = process.env.ANDROID_SERIAL;
const device = serial ? ['-s', serial] : [];
let fixture_pushed = false;
/** @param {string} program @param {string[]} args */
function run(program, args, cwd = directory) {
	const result = spawnSync(program, args, { cwd, encoding: 'utf8', env: process.env, timeout: 180000 });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${program} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
}
try {
	mkdirSync(join(directory, 'app/src/main/java/dev/gpuix/a11ytest'), { recursive: true });
	writeFileSync(join(directory, 'settings.gradle.kts'), 'pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\nrootProject.name = "AccessibilityTest"\ninclude(":app")\n');
	writeFileSync(join(directory, 'build.gradle.kts'), 'plugins { id("com.android.application") version "9.1.0" apply false }\n');
	writeFileSync(join(directory, 'app/build.gradle.kts'), 'plugins { id("com.android.application") }\nandroid { namespace = "dev.gpuix.a11ytest"; compileSdk = 36; defaultConfig { applicationId = "dev.gpuix.a11ytest"; minSdk = 26; targetSdk = 36; versionCode = 1; versionName = "1" } }\n');
	writeFileSync(join(directory, 'app/src/main/AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="GPUI accessibility test"/><instrumentation android:name="dev.gpuix.a11ytest.AccessibilityTest" android:targetPackage="dev.gpuix.a11ytest"/></manifest>\n');
	writeFileSync(join(directory, 'app/src/main/java/dev/gpuix/a11ytest/AccessibilityTest.java'), readFileSync(new URL('./AccessibilityTest.java', import.meta.url)));
	run(process.env.GRADLE ?? 'gradle', ['--no-daemon', 'assembleDebug']);
	console.log(run(adb, [...device, 'install', '-r', join(directory, 'app/build/outputs/apk/debug/app-debug.apk')]));
	const fixture = join(directory, 'gpuix-picker.txt');
	if (spawnSync(adb, [...device, 'shell', 'test', '-e', '/sdcard/Download/gpuix-picker.txt']).status === 0) throw new Error('Refusing to overwrite /sdcard/Download/gpuix-picker.txt');
	writeFileSync(fixture, 'hello-picker\n');
	run(adb, [...device, 'push', fixture, '/sdcard/Download/gpuix-picker.txt']);
	fixture_pushed = true;
	run(adb, [...device, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Download/gpuix-picker.txt']);
	run(adb, [...device, 'shell', 'am', 'force-stop', target]);
	const output = run(adb, [...device, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'target', target, 'dev.gpuix.a11ytest/dev.gpuix.a11ytest.AccessibilityTest']);
	console.log(output);
	if (!output.includes('PASS: native accessibility') || !output.includes('INSTRUMENTATION_CODE: -1')) {
		throw new Error('Android native accessibility assertions failed');
	}
} finally {
	if (fixture_pushed) spawnSync(adb, [...device, 'shell', 'rm', '-f', '/sdcard/Download/gpuix-picker.txt'], { stdio: 'ignore' });
	rmSync(directory, { recursive: true, force: true });
}
