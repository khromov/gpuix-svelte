import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MOBILE_CONFIG, validate_mobile_config } from '../scripts/mobile-config.ts';
import { ios_architecture, ios_cargo_env } from '../scripts/mobile.ts';
import { check, finish } from 'gpuix-svelte/test';

const config = validate_mobile_config(structuredClone(DEFAULT_MOBILE_CONFIG));
check('default mobile config retains the normal entry', config.entry, 'src/main.ts');
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

check('Apple Silicon simulator Rust and Xcode architectures agree', ios_architecture(true, 'arm64'), { rust: 'aarch64-apple-ios-sim', xcode: 'arm64' });
check('Intel simulator Rust and Xcode architectures agree', ios_architecture(true, 'x64'), { rust: 'x86_64-apple-ios', xcode: 'x86_64' });
check('iOS devices use arm64 regardless of build host', ios_architecture(false, 'x64'), { rust: 'aarch64-apple-ios', xcode: 'arm64' });

const mobile_cli = fileURLToPath(new URL('../bin/gpuix-svelte.js', import.meta.url));
const scaffold_root = mkdtempSync(join(tmpdir(), 'gpuix-mobile-config-'));
try {
	const initialized = spawnSync(process.execPath, [mobile_cli, 'mobile', 'init'], { cwd: scaffold_root, encoding: 'utf8' });
	const native = join(scaffold_root, '.gpuix/mobile/native');
	const cargo = readFileSync(join(native, 'Cargo.toml'), 'utf8');
	const android = readFileSync(join(scaffold_root, '.gpuix/mobile/android/settings.gradle.kts'), 'utf8');
	const rust = readFileSync(join(native, 'src/android.rs'), 'utf8');
	const android_manifest = readFileSync(join(scaffold_root, '.gpuix/mobile/android/app/src/main/AndroidManifest.xml'), 'utf8');
	const ios_project = readFileSync(join(scaffold_root, '.gpuix/mobile/ios/project.yml'), 'utf8');
	check('init generates a generic Rust launcher with the txiki host', initialized.status === 0 && cargo.includes('gpuix-svelte-txiki-host') && cargo.includes('.generated/gpui-pre') && !cargo.includes('gpuix-qjs') && rust.includes('EmbeddedRenderer') && !rust.includes('Counter'), true);
	check('Android scaffold consumes the reusable local GPUI mobile library', android.includes('include(":app", ":gpui-mobile")') && android.includes('.generated/gpui-mobile/android') && cargo.includes('.generated/gpui-mobile') && cargo.includes('.generated/gpui-pre-wgpu'), true);
	check('mobile launcher provisions OS app directories for txiki', cargo.includes('features = ["path_provider"]') && cargo.includes('gpuix-svelte-txiki-host') && !rust.includes('gpuix_qjs'), true);
	check('Android manifest allows networking without broad storage permissions', android_manifest.includes('android.permission.INTERNET') && !android_manifest.includes('EXTERNAL_STORAGE'), true);
	check('Android activity resizes its content for the input method', android_manifest.includes('android:windowSoftInputMode="adjustResize"'), true);
	check('iOS scaffold declares a launch screen and supported orientations', ios_project.includes('path: Info.plist') && ios_project.includes('UILaunchScreen: {}') && ios_project.includes('UISupportedInterfaceOrientations: [UIInterfaceOrientationPortrait, UIInterfaceOrientationLandscapeLeft, UIInterfaceOrientationLandscapeRight]'), true);
	check('iOS cargo environment targets the configured deployment version', ios_cargo_env(config, '/toolchain/clang', '--sysroot=/sdk').IPHONEOS_DEPLOYMENT_TARGET, config.ios.deploymentTarget);
	const blocked = mkdtempSync(join(tmpdir(), 'gpuix-mobile-blocked-'));
	try {
		mkdirSync(join(blocked, '.gpuix/mobile'), { recursive: true });
		const refused = spawnSync(process.execPath, [mobile_cli, 'mobile', 'init'], { cwd: blocked, encoding: 'utf8' });
		check('init refuses an unmarked generated directory without creating config', refused.status !== 0 && !existsSync(join(blocked, 'gpuix.mobile.json')), true);
	} finally { rmSync(blocked, { recursive: true, force: true }); }
} finally { rmSync(scaffold_root, { recursive: true, force: true }); }
finish('mobile-config', 16);
