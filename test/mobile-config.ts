import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MOBILE_CONFIG, read_mobile_config, validate_mobile_config } from '../scripts/mobile-config.ts';
import { copy_asset, find_gradle, gradle_wrapper, ios_architecture, ios_build_tools, ios_cargo_env, scaffold, watchable } from '../scripts/mobile.ts';
import { check, finish } from 'gpuix-svelte/test';

const config = validate_mobile_config(structuredClone(DEFAULT_MOBILE_CONFIG));
check('default mobile config uses the starter entry', config.entry, 'app.ts');
check('default Android ABI and SDK levels are explicit', [config.android.abis, config.android.compileSdk, config.android.minSdk], [['arm64-v8a'], 36, 26]);
let invalid_id = false;
try { validate_mobile_config({ ...config, appId: 'not-an-app-id' }); } catch (error) { invalid_id = (error as Error).message.includes('appId'); }
check('invalid application identifiers fail validation', invalid_id, true);
let invalid_abi = false;
try { validate_mobile_config({ ...config, android: { ...config.android, abis: ['mips'] } }); } catch (error) { invalid_abi = (error as Error).message.includes('android.abis'); }
check('unsupported Android ABIs fail validation', invalid_abi, true);
let invalid_team = false;
try { validate_mobile_config({ ...config, ios: { ...config.ios, teamId: 'short' } }); } catch (error) { invalid_team = (error as Error).message.includes('ios.teamId'); }
check('malformed Apple team identifiers fail validation', invalid_team, true);
let invalid_version = false;
try { validate_mobile_config({ ...config, version: '1.2-beta' }); } catch (error) { invalid_version = (error as Error).message.includes('version'); }
check('mobile version requires three numeric components', invalid_version, true);
let invalid_build = false;
try { validate_mobile_config({ ...config, buildNumber: 0 }); } catch (error) { invalid_build = (error as Error).message.includes('buildNumber'); }
check('mobile build number must be positive', invalid_build, true);
let invalid_assets = false;
try { validate_mobile_config({ ...config, assets: ['../outside'] }); } catch (error) { invalid_assets = (error as Error).message.includes('assets'); }
check('asset paths cannot escape the project', invalid_assets, true);
check('the watcher skips generated files but sees app and asset edits', ['.gpuix/x', 'node_modules/x', 'src/App.svelte', 'assets/icon.png'].map(watchable), [false, false, true, true]);
const assets_dir = mkdtempSync(join(tmpdir(), 'gpuix-mobile-assets-'));
try {
	copy_asset('assets/icon.png', assets_dir);
	check('configured resources retain their project-relative names', readFileSync(join(assets_dir, 'gpuix-resources/assets/icon.png')).equals(readFileSync('assets/icon.png')), true);
	let refused = false;
	try { copy_asset('../', assets_dir); } catch { refused = true; }
	check('resource copying refuses a path outside the project', refused, true);
} finally { rmSync(assets_dir, { recursive: true, force: true }); }

check('Apple Silicon simulator Rust and Xcode architectures agree', ios_architecture(true, 'arm64'), { rust: 'aarch64-apple-ios-sim', xcode: 'arm64' });
check('Intel simulator Rust and Xcode architectures agree', ios_architecture(true, 'x64'), { rust: 'x86_64-apple-ios', xcode: 'x86_64' });
check('iOS devices use arm64 regardless of build host', ios_architecture(false, 'x64'), { rust: 'aarch64-apple-ios', xcode: 'arm64' });

const mobile_cli = fileURLToPath(new URL('../bin/gpuix-svelte.js', import.meta.url));
const scaffold_root = mkdtempSync(join(tmpdir(), 'gpuix-mobile-config-'));
try {
	const initialized = spawnSync(process.execPath, [mobile_cli, 'mobile', 'init'], { cwd: scaffold_root, encoding: 'utf8' });
	const native = join(scaffold_root, '.gpuix/mobile/native');
	const cargo = readFileSync(join(native, 'Cargo.toml'), 'utf8');
	check('init does not create gpuix.mobile.json', [initialized.status, existsSync(join(scaffold_root, '.gpuix/mobile')), existsSync(join(scaffold_root, 'gpuix.mobile.json'))], [0, true, false]);
	const missing_entry = spawnSync(process.execPath, [mobile_cli, 'mobile', 'build', 'android'], { cwd: scaffold_root, encoding: 'utf8' });
	check('missing entry fails before preparing native sources', missing_entry.status !== 0 && missing_entry.stderr.includes('entry does not exist') && !missing_entry.stdout.includes('[gpuix] prepared'), true);
	
	writeFileSync(join(scaffold_root, 'app.ts'), `import { render } from 'gpuix-svelte';
import App from './App.svelte';
render(App, {
	title: 'My Custom App',
	app: {
		name: 'My Custom App',
		identifier: 'dev.custom.myapp',
		version: '2.3.4',
		buildNumber: 42,
		assets: ['assets/icon.png'],
		ios: { deploymentTarget: '17.0', teamId: 'TEAMID1234' },
		android: { abis: ['arm64-v8a', 'x86_64'], compileSdk: 35, minSdk: 28, targetSdk: 35, ndkVersion: '28.0.12345' }
	}
});
`);
	const custom_config = read_mobile_config('app.ts', scaffold_root);
	check(
		'entry file app options configure mobile settings directly',
		[custom_config.name, custom_config.appId, custom_config.version, custom_config.buildNumber, custom_config.assets, custom_config.ios.deploymentTarget, custom_config.ios.teamId, custom_config.android.compileSdk, custom_config.android.minSdk, custom_config.android.ndkVersion],
		['My Custom App', 'dev.custom.myapp', '2.3.4', 42, ['assets/icon.png'], '17.0', 'TEAMID1234', 35, 28, '28.0.12345']
	);
	scaffold(custom_config, scaffold_root);

	const android = readFileSync(join(scaffold_root, '.gpuix/mobile/android/settings.gradle.kts'), 'utf8');
	const rust = readFileSync(join(native, 'src/android.rs'), 'utf8');
	const android_manifest = readFileSync(join(scaffold_root, '.gpuix/mobile/android/app/src/main/AndroidManifest.xml'), 'utf8');
	const ios_project = readFileSync(join(scaffold_root, '.gpuix/mobile/ios/project.yml'), 'utf8');
	const android_build = readFileSync(join(scaffold_root, '.gpuix/mobile/android/app/build.gradle.kts'), 'utf8');
	check('mobile versions and custom configs reach both platforms', android_build.includes('versionCode = 42') && android_build.includes('versionName = "2.3.4"') && android_build.includes('namespace = "dev.custom.myapp"') && ios_project.includes('CFBundleShortVersionString: "2.3.4"') && ios_project.includes('CFBundleVersion: "42"') && ios_project.includes('PRODUCT_BUNDLE_IDENTIFIER: dev.custom.myapp') && ios_project.includes('DEVELOPMENT_TEAM: TEAMID1234'), true);
	check('init generates a generic Rust launcher with the txiki host', initialized.status === 0 && cargo.includes('gpuix-svelte-txiki-host') && cargo.includes('.generated/gpui-pre') && !cargo.includes('gpuix-qjs') && rust.includes('EmbeddedRenderer') && !rust.includes('Counter'), true);
	check('Android scaffold consumes the reusable local GPUI mobile library', android.includes('include(":app", ":gpui-mobile")') && android.includes('.generated/gpui-mobile/android') && cargo.includes('.generated/gpui-mobile') && cargo.includes('.generated/gpui-pre-wgpu'), true);
	check('mobile launcher provisions OS app directories for txiki', cargo.includes('features = ["path_provider"]') && cargo.includes('gpuix-svelte-txiki-host') && !rust.includes('gpuix_qjs'), true);
	check('Android manifest allows networking without broad storage permissions', android_manifest.includes('android.permission.INTERNET') && !android_manifest.includes('EXTERNAL_STORAGE'), true);
	check('Android activity resizes its content for the input method', android_manifest.includes('android:windowSoftInputMode="adjustResize"'), true);
	check('iOS scaffold declares a launch screen and supported orientations', ios_project.includes('path: Info.plist') && ios_project.includes('UILaunchScreen: {}') && ios_project.includes('UISupportedInterfaceOrientations: [UIInterfaceOrientationPortrait, UIInterfaceOrientationLandscapeLeft, UIInterfaceOrientationLandscapeRight]'), true);
	check('release signing is supplied through the Android environment', android_build.includes('GPUIX_ANDROID_KEYSTORE') && android_build.includes('GPUIX_ANDROID_KEY_PASSWORD') && android_build.includes('signingConfig = signingConfigs.getByName("gpuixRelease")'), true);
	const icon = fileURLToPath(new URL('../assets/icon.png', import.meta.url));
	const mobile_module = new URL('../scripts/mobile.ts', import.meta.url).href;
	const icon_script = `import { scaffold } from ${JSON.stringify(mobile_module)}; scaffold(${JSON.stringify({ ...config, icon })});`;
	const with_icon = spawnSync(process.execPath, ['--input-type=module', '-e', icon_script], { cwd: scaffold_root, encoding: 'utf8' });
	const icon_android = join(scaffold_root, '.gpuix/mobile/android/app/src/main/res/drawable-nodpi/gpuix_icon.png');
	const icon_ios = join(scaffold_root, '.gpuix/mobile/ios/Images.xcassets/AppIcon.appiconset/icon.png');
	check('a configured icon reaches both platform projects', with_icon.status === 0 && readFileSync(icon_android).equals(readFileSync(icon)) && readFileSync(icon_ios).equals(readFileSync(icon)) && readFileSync(join(scaffold_root, '.gpuix/mobile/android/app/src/main/AndroidManifest.xml'), 'utf8').includes('@drawable/gpuix_icon') && readFileSync(join(scaffold_root, '.gpuix/mobile/ios/project.yml'), 'utf8').includes('ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon'), true);
	check('iOS cargo environment targets the configured deployment version', ios_cargo_env(config, '/toolchain/clang', '--sysroot=/sdk').IPHONEOS_DEPLOYMENT_TARGET, config.ios.deploymentTarget);
	const tool_bin = join(scaffold_root, 'bin');
	const sdk_bin = join(scaffold_root, 'sdk/cmake/3.22.1/bin');
	mkdirSync(tool_bin, { recursive: true });
	mkdirSync(sdk_bin, { recursive: true });
	for (const path of [join(tool_bin, 'xcodegen'), join(sdk_bin, 'cmake'), join(sdk_bin, 'ninja')]) { writeFileSync(path, ''); chmodSync(path, 0o755); }
	const tool_env = { PATH: tool_bin, ANDROID_HOME: join(scaffold_root, 'sdk') };
	check('iOS finds CMake and Ninja in the Android SDK', ios_build_tools(tool_env), { cmake: join(sdk_bin, 'cmake'), ninja: join(sdk_bin, 'ninja'), xcodegen: join(tool_bin, 'xcodegen') });
	writeFileSync(join(tool_bin, 'cmake'), ''); chmodSync(join(tool_bin, 'cmake'), 0o755);
	check('iOS prefers tools on PATH', ios_build_tools(tool_env).cmake, join(tool_bin, 'cmake'));
	let tools_error = '';
	try { ios_build_tools({ PATH: '', ANDROID_HOME: join(scaffold_root, 'missing-sdk') }, scaffold_root); } catch (error) { tools_error = (error as Error).message; }
	check('missing iOS tools name an installation command', tools_error.includes('brew install cmake ninja xcodegen'), true);
	const gradle_root = join(scaffold_root, 'gradle-home');
	const cached = join(gradle_root, 'wrapper/dists/gradle-9.4.1-bin/hash/gradle-9.4.1/bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');
	mkdirSync(join(cached, '..'), { recursive: true });
	writeFileSync(cached, '');
	chmodSync(cached, 0o755);
	const no_path = { PATH: '', GRADLE_USER_HOME: gradle_root };
	check('uses the cached Gradle distribution when gradle is not on PATH', find_gradle(no_path, scaffold_root), cached);
	check('an invalid explicit GRADLE does not silently fall back', find_gradle({ ...no_path, GRADLE: join(scaffold_root, 'missing') }, scaffold_root) === undefined, true);
	const missing_home = { PATH: '', GRADLE_USER_HOME: join(scaffold_root, 'empty') };
	check('reports a missing Gradle distribution', find_gradle(missing_home, scaffold_root) === undefined, true);
	let rejected = false;
	try {
		await gradle_wrapper(join(scaffold_root, 'wrapper-test'), async () => new Response('corrupt'));
	} catch (error) { rejected = (error as Error).message.includes('checksum mismatch'); }
	check('rejects a corrupt downloaded Gradle wrapper', rejected, true);
	check('does not save a corrupt Gradle wrapper', existsSync(join(scaffold_root, 'wrapper-test/gradle/wrapper/gradle-wrapper.jar')), false);
	const blocked = mkdtempSync(join(tmpdir(), 'gpuix-mobile-blocked-'));
	try {
		mkdirSync(join(blocked, '.gpuix/mobile'), { recursive: true });
		const refused = spawnSync(process.execPath, [mobile_cli, 'mobile', 'init'], { cwd: blocked, encoding: 'utf8' });
		check('init refuses an unmarked generated directory without creating config', refused.status !== 0 && !existsSync(join(blocked, 'gpuix.mobile.json')), true);
	} finally { rmSync(blocked, { recursive: true, force: true }); }
} finally { rmSync(scaffold_root, { recursive: true, force: true }); }
finish('mobile-config', 36);
