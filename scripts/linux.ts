// Drives the Linux container from macOS: the image is amd64 (there is no linux-arm64
// prebuild of @gpuix/native), the window lives in a sway session inside it, and noVNC
// brings it back to a browser tab. CLAUDE.md's "Running on Linux" has the why.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = 'gpuix-svelte-linux';
const CONTAINER = 'gpuix-svelte-linux';
const VOLUME = 'gpuix-svelte-node-modules';
const URL_ = 'http://localhost:6080/vnc.html?autoconnect=1&resize=scale';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.linux-out');

/** `demo` runs these by name; the rest of the examples do not survive the trip. */
const DEMOS: Record<string, string> = {
	counter: 'examples/counter/main.ts',
	tictactoe: 'examples/tic-tac-toe/main.ts',
	hn: 'examples/hacker-news/main.ts',
	glass: 'examples/liquid-glass/main.ts',
	styling: 'examples/styling-playground/main.ts',
	tutorial: 'examples/tutorial/main.ts'
};

const UNSUPPORTED: Record<string, string> = {
	'glass-ffi': 'the ObjC shim it compiles is macOS-only',
	brain: 'Bun-only, needs ~380 MB of models, and its recorder has no Linux backend'
};

const [command = 'help', ...rest] = process.argv.slice(2);
const bun = rest.includes('--bun');
// sway tiles, which suits looking at four demos at once; --desktop swaps in labwc,
// which floats them with draggable titlebars and min/max/close buttons.
const desktop = rest.includes('--desktop');
const args = rest.filter((a) => a !== '--bun' && a !== '--desktop');

function run(cmd: string, argv: string[], { check = true } = {}): number {
	console.log(`\n[linux] ${cmd} ${argv.join(' ')}`);
	const { status } = spawnSync(cmd, argv, { cwd: root, stdio: 'inherit' });
	if (check && status !== 0) process.exit(status ?? 1);
	return status ?? 1;
}

/** The flags every `docker run` here shares. `ports` off lets a shell open alongside a demo. */
function run_flags(name?: string, ports = true): string[] {
	mkdirSync(out, { recursive: true });
	return [
		'run',
		'--rm',
		'--platform',
		'linux/amd64',
		// Every Wayland buffer is wl_shm, and the 64 MB default does not survive four
		// demos plus wayvnc's screencopy.
		'--shm-size',
		'1g',
		...(name ? ['--name', name] : []),
		// The named volume shadows the bind mount, so the host's darwin-only
		// node_modules never reaches the container and the image's linux one stands.
		'-v',
		`${root}:/app`,
		'-v',
		`${VOLUME}:/app/node_modules`,
		'-v',
		`${out}:/out`,
		// Loopback only: wayvnc and x11vnc run with no authentication.
		...(ports ? ['-p', '127.0.0.1:6080:6080', '-p', '127.0.0.1:5900:5900'] : []),
		'-e',
		`GPUIX_LINUX_DISPLAY=${process.env.GPUIX_LINUX_DISPLAY ?? 'wayland'}`,
		'-e',
		`GPUIX_LINUX_SIZE=${process.env.GPUIX_LINUX_SIZE ?? '1280x800'}`,
		'-e',
		`GPUIX_LINUX_WM=${desktop ? 'labwc' : (process.env.GPUIX_LINUX_WM ?? 'sway')}`,
		'-e',
		`GPUIX_LINUX_BORDER=${process.env.GPUIX_LINUX_BORDER ?? 'none'}`
	];
}

function open_viewer() {
	// The session needs a moment to bind 6080; the tab reconnects on its own anyway.
	setTimeout(() => spawn('open', [URL_], { stdio: 'ignore', detached: true }).unref(), 2500);
}

function gpuix(entry: string): string[] {
	return ['node', 'bin/gpuix-svelte.js', ...(bun ? ['--bun'] : []), entry];
}


/**
 * A click over RFB, which is the path noVNC itself uses. GPUI ignores the button
 * events `wlrctl` injects through zwlr_virtual_pointer (its motion arrives, so hover
 * works and clicks silently do not), and `swaymsg seat cursor` reports success into
 * the void because the headless backend gives the seat no pointer device at all.
 * A windowed renderer cannot take `simulateClick` either — see src/test-window.ts.
 */
function vnc_click(x: number, y: number, port = 5900): Promise<void> {
	return new Promise((resolve, reject) => {
		const sock = connect(port, '127.0.0.1');
		let buf = Buffer.alloc(0);
		let stage = 'version';
		const eat = (n: number) => {
			const b = buf.subarray(0, n);
			buf = buf.subarray(n);
			return b;
		};

		sock.on('error', (e) => reject(new Error(`[linux] no VNC on ${port} — is a demo running? (${e.message})`)));
		sock.on('data', (d: Buffer) => {
			buf = Buffer.concat([buf, d]);
			if (stage === 'version' && buf.length >= 12) {
				eat(12);
				sock.write('RFB 003.008\n');
				stage = 'security';
			}
			if (stage === 'security' && buf.length >= 1 && buf.length >= 1 + buf[0]) {
				const types = [...eat(1 + buf[0]).subarray(1)];
				if (!types.includes(1)) return reject(new Error('[linux] VNC server wants authentication'));
				sock.write(Buffer.from([1]));
				stage = 'secresult';
			}
			if (stage === 'secresult' && buf.length >= 4) {
				if (eat(4).readUInt32BE(0) !== 0) return reject(new Error('[linux] VNC auth failed'));
				sock.write(Buffer.from([1]));
				stage = 'serverinit';
			}
			if (stage === 'serverinit' && buf.length >= 24 && buf.length >= 24 + buf.readUInt32BE(20)) {
				stage = 'done';
				const at = (mask: number) => {
					const b = Buffer.alloc(6);
					b.writeUInt8(5, 0);
					b.writeUInt8(mask, 1);
					b.writeUInt16BE(x, 2);
					b.writeUInt16BE(y, 4);
					sock.write(b);
				};
				// GPUI wants the press and release as distinct events, not one frame.
				at(0);
				setTimeout(() => at(1), 100);
				setTimeout(() => at(0), 260);
				setTimeout(() => {
					sock.end();
					resolve();
				}, 480);
			}
		});
	});
}

switch (command) {
	case 'build': {
		run('docker', ['build', '--platform', 'linux/amd64', '-f', 'docker/Dockerfile', '-t', IMAGE, '.']);
		// A stale volume outlives a lockfile change and shows up as "module not found".
		run('docker', ['volume', 'rm', '-f', VOLUME], { check: false });
		console.log(`\n[linux] built ${IMAGE} — the node_modules volume repopulates on the next run`);
		break;
	}

	case 'demos': {
		open_viewer();
		run('docker', [...run_flags(CONTAINER), IMAGE, 'node', '--import', 'tsx', 'scripts/demo-all.ts', ...(bun ? ['--bun'] : [])]);
		break;
	}

	case 'demo': {
		const name = args[0] ?? 'counter';
		if (UNSUPPORTED[name]) {
			console.error(`[linux] ${name} does not run on Linux: ${UNSUPPORTED[name]}`);
			process.exit(1);
		}
		const entry = DEMOS[name];
		if (!entry) {
			console.error(`[linux] unknown demo "${name}" — one of ${Object.keys(DEMOS).join(', ')}`);
			process.exit(1);
		}
		open_viewer();
		run('docker', [...run_flags(CONTAINER), IMAGE, ...gpuix(entry)]);
		break;
	}

	case 'shot': {
		const name = args[0] ?? 'shot';
		// captureScreenshot needs a test-support build, which Linux does not get, so
		// the picture has to come from the compositor rather than from GPUI.
		// The entrypoint discovers the socket name and leaves it here, because a
		// `docker exec` inherits the service's environment, not the session's.
		const wayland = (process.env.GPUIX_LINUX_DISPLAY ?? 'wayland') === 'wayland';
		const grab = wayland
			? ['sh', '-c', `. /tmp/gpuix-session.env && grim /out/${name}.png`]
			: ['sh', '-c', `. /tmp/gpuix-session.env && import -window root /out/${name}.png`];
		run('docker', ['exec', CONTAINER, ...grab]);
		console.log(`\n[linux] .linux-out/${name}.png`);
		break;
	}

	case 'click': {
		const x = Number(args[0]);
		const y = Number(args[1]);
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			console.error('[linux] usage: linux:click -- <x> <y>');
			process.exit(1);
		}
		await vnc_click(x, y);
		console.log(`[linux] clicked ${x},${y}`);
		break;
	}

	case 'shell': {
		run('docker', [...run_flags(undefined, false), '-it', IMAGE, 'bash']);
		break;
	}

	case 'test': {
		// Ordered so a failure localises: binding, then static checks, then the build,
		// then the only suite that can assert against GPUI here.
		const steps = [
			`echo "[linux] arch: $(uname -m)"`,
			`node -e "const n=require('@gpuix/native'); if (typeof n.GpuixRenderer!=='function') { console.error('GpuixRenderer missing from the linux prebuild'); process.exit(1) } console.log('[linux] binding ok, TestGpuixRenderer:', n.hasTestGpuixRenderer())"`,
			`echo "[linux] the 15 headless suites are skipped: the linux prebuild ships no TestGpuixRenderer (it needs render_to_image, which the wgpu backend lacks)"`,
			`npm run typecheck`,
			`npm run lint`,
			`npm run compile`,
			bun ? `npm run bun:test:window-smoke` : `npm run test:window-smoke`
		];
		run('docker', [...run_flags(CONTAINER), IMAGE, 'bash', '-lc', steps.join(' && ')]);
		break;
	}

	default:
		console.log(`usage: linux.ts <build|test|demos|demo <name>|shot [name]|shell> [--bun]

  build          build the amd64 image and reset the node_modules volume
  test           binding check, typecheck, lint, compile, windowed smoke test
  demos          all four demos, tiled, at ${URL_}
  demo <name>    one of ${Object.keys(DEMOS).join(', ')}
  shot [name]    grab a PNG from the running session into .linux-out/
  click <x> <y> click a running demo over VNC (real input, unlike simulateClick)
  shell          interactive bash in the container

  --desktop      float the windows under labwc, with draggable titlebars and
                 minimise/maximise/close buttons, instead of sway's tiling

  GPUIX_LINUX_SIZE sets the sway output (default 1280x800).
  GPUIX_LINUX_DISPLAY=x11 starts Xvfb instead, but GPUI maps no window there yet
  — see CLAUDE.md, "Running on Linux". Wayland is the working mode.`);
		process.exit(command === 'help' ? 0 : 1);
}
