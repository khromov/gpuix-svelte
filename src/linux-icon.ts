/**
 * A built app's icon on Linux, where nothing in an executable is read for one: the desktop entry and icon
 * theme files that GNOME and KDE find a window's icon through by its app id, and the `_NET_WM_ICON` that
 * other X11 window managers read off the window itself. GNOME uses only the first, Wayland has no second.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
// A namespace, since Bun's browser polyfill for node:net has no `connect` to import by name and the web build bundles this too.
import * as net from 'node:net';
import type { Socket } from 'node:net';
import { homedir, hostname } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

/** What gpuix-svelte/build embeds as `GPUIX_APP_ICON`, base64: the icon theme's PNGs by size, unless the build opted out of the desktop entry, and `_NET_WM_ICON`'s data. */
export interface EmbeddedIcon {
	png?: Record<string, string>;
	x11: string;
}

const TAG = '[gpuix-svelte]';

/** A desktop file ID and icon name, which also keeps the paths built from it inside their directories. */
const APP_ID = /^[A-Za-z0-9][\w.-]*$/;

/**
 * Writes the desktop entry, which has to be in place before the window opens for GNOME to match it at once,
 * and returns what sets `_NET_WM_ICON` once the window is there; null outside a Linux build.
 */
export function linux_icon(app_id: string | undefined, name: string): (() => void) | null {
	// Spelled out so gpuix-svelte/build's define replaces it.
	const raw = typeof process === 'undefined' ? undefined : process.env.GPUIX_APP_ICON;
	if (!raw || process.platform !== 'linux' || !app_id || !APP_ID.test(app_id)) return null;
	let icon: EmbeddedIcon;
	try {
		icon = JSON.parse(raw) as EmbeddedIcon;
	} catch {
		return null;
	}
	if (icon.png) {
		try {
			install_desktop_entry(data_home(), app_id, name, process.execPath, icon.png);
		} catch (error) {
			console.error(`${TAG} could not install the desktop entry that gives the window its icon:`, (error as Error).message);
		}
	}
	// gpui takes Wayland whenever WAYLAND_DISPLAY is set, and X11 only otherwise.
	if (process.env.WAYLAND_DISPLAY || !icon.x11) return null;
	return () => {
		set_x11_icon(Buffer.from(icon.x11, 'base64'), process.pid).catch((error: Error) => console.error(`${TAG} could not set the window icon:`, error.message));
	};
}

export function data_home(env: Record<string, string | undefined> = process.env): string {
	const xdg = env.XDG_DATA_HOME;
	return xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.local', 'share');
}

/** Hidden from the app grid, since running the app is not installing it; GNOME and KDE match the window to it by `StartupWMClass`. */
export function desktop_entry(app_id: string, name: string, executable: string): string {
	return [
		'[Desktop Entry]',
		'Type=Application',
		`Name=${escape(name)}`,
		`Exec=${escape(exec_argument(executable))}`,
		`TryExec=${escape(executable)}`,
		`Icon=${app_id}`,
		`StartupWMClass=${app_id}`,
		'NoDisplay=true',
		'Terminal=false',
		''
	].join('\n');
}

function escape(value: string): string {
	return value.replace(/[\\\n\t\r]/g, (c) => ({ '\\': '\\\\', '\n': '\\n', '\t': '\\t', '\r': '\\r' })[c] ?? c);
}

/** The desktop entry spec's quoting, which `escape` then applies its own escapes on top of. */
function exec_argument(path: string): string {
	const quoted = /[\s"'\\><~|&;$*?#()`]/.test(path) ? `"${path.replace(/["`$\\]/g, '\\$&')}"` : path;
	return quoted.replaceAll('%', '%%');
}

/** Writes only what is missing or changed, the icons before the entry, each through a rename so nothing reads half a file. */
export function install_desktop_entry(home: string, app_id: string, name: string, executable: string, png: Record<string, string>): number {
	const files: Array<[string, Buffer]> = Object.entries(png).map(([size, data]) => [join(home, 'icons', 'hicolor', `${size}x${size}`, 'apps', `${app_id}.png`), Buffer.from(data, 'base64')]);
	files.push([join(home, 'applications', `${app_id}.desktop`), Buffer.from(desktop_entry(app_id, name, executable))]);
	let written = 0;
	for (const [path, bytes] of files) {
		if (existsSync(path) && readFileSync(path).equals(bytes)) continue;
		mkdirSync(dirname(path), { recursive: true });
		const partial = `${path}.${process.pid}.tmp`;
		writeFileSync(partial, bytes);
		renameSync(partial, path);
		written++;
	}
	return written;
}

const CARDINAL = 6;
const FAMILY_LOCAL = 256;
const FAMILY_WILD = 65535;
const TIMEOUT_MS = 5000;
const pad = (n: number) => (n + 3) & ~3;

/** The MIT-MAGIC-COOKIE-1 Xlib would pick from an Xauthority file: this host's or a wildcard entry, for this display or any. */
export function x11_cookie(file: Buffer, display: string, host: string): Buffer | null {
	try {
		for (let at = 0; at < file.length; ) {
			const family = file.readUInt16BE(at);
			at += 2;
			const fields: Buffer[] = [];
			for (let i = 0; i < 4; i++) {
				const length = file.readUInt16BE(at);
				fields.push(file.subarray(at + 2, at + 2 + length));
				at += 2 + length;
			}
			const [address, number, kind, cookie] = fields;
			if (kind.toString() !== 'MIT-MAGIC-COOKIE-1' || (number.length > 0 && number.toString() !== display)) continue;
			if (family === FAMILY_WILD || (family === FAMILY_LOCAL && address.toString() === host)) return cookie;
		}
	} catch {
		// A truncated file has no more entries to offer.
	}
	return null;
}

/** The local display in DISPLAY, authorized as Xlib would be; null for none, or a TCP one such as ssh forwarding. */
export async function open_display(env: Record<string, string | undefined> = process.env): Promise<X11 | null> {
	const display = /^(?:unix)?:(\d+)(?:\.\d+)?$/.exec(env.DISPLAY ?? '')?.[1];
	if (display === undefined) return null;
	let auth: Buffer | null = null;
	try {
		auth = x11_cookie(readFileSync(env.XAUTHORITY || join(homedir(), '.Xauthority')), display, hostname());
	} catch {
		// No Xauthority file: a server that trusts local users takes the connection without one.
	}
	return X11.open(`/tmp/.X11-unix/X${display}`, auth);
}

/** Sets the icon on every top-level window of `pid`, speaking the X11 protocol itself so no runtime needs FFI; resolves to how many. */
export async function set_x11_icon(icon: Buffer, pid: number, env: Record<string, string | undefined> = process.env): Promise<number> {
	const x = await open_display(env);
	if (!x) return 0;
	try {
		const [pid_atom, icon_atom] = await Promise.all([x.atom('_NET_WM_PID'), x.atom('_NET_WM_ICON')]);
		let windows: number[] = [];
		for (let attempt = 0; attempt < 10 && windows.length === 0; attempt++) {
			if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 100));
			windows = await x.windows_of(pid_atom, pid);
		}
		for (const window of windows) x.change_property(window, icon_atom, CARDINAL, icon);
		// Closing before the server has read the requests can lose them.
		await x.sync();
		if (x.refused !== null) throw new Error(`the X server refused _NET_WM_ICON with error ${x.refused}`);
		return windows.length;
	} finally {
		x.close();
	}
}

interface Waiter {
	resolve(packet: Buffer): void;
	reject(error: Error): void;
}

export interface Property {
	type: number;
	format: number;
	data: Buffer;
}

/** Just the requests the icon needs, in the client's little-endian byte order. */
export class X11 {
	root = 0;
	/** The error code of a request nobody waited on, which is how a failed ChangeProperty shows up. */
	refused: number | null = null;
	private socket: Socket;
	private input = Buffer.alloc(0);
	private sequence = 0;
	private max_request = 0;
	private waiting = new Map<number, Waiter>();
	private setup: Waiter | null = null;

	private constructor(socket: Socket) {
		this.socket = socket;
		socket.on('data', (chunk: Buffer) => {
			this.input = Buffer.concat([this.input, chunk]);
			this.read();
		});
		const fail = (error: Error) => {
			for (const waiter of [this.setup, ...this.waiting.values()]) waiter?.reject(error);
			this.setup = null;
			this.waiting.clear();
		};
		socket.on('error', fail);
		socket.on('close', () => fail(new Error('the X server closed the connection')));
		socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error(`the X server did not answer within ${TIMEOUT_MS} ms`)));
		socket.unref();
	}

	static async open(path: string, cookie: Buffer | null): Promise<X11> {
		const x = new X11(net.connect(path));
		const name = Buffer.from(cookie ? 'MIT-MAGIC-COOKIE-1' : '');
		const data = cookie ?? Buffer.alloc(0);
		const request = Buffer.alloc(12 + pad(name.length) + pad(data.length));
		request.write('l', 0, 'latin1');
		request.writeUInt16LE(11, 2);
		request.writeUInt16LE(name.length, 6);
		request.writeUInt16LE(data.length, 8);
		name.copy(request, 12);
		data.copy(request, 12 + pad(name.length));
		const reply = await new Promise<Buffer>((resolve, reject) => {
			x.setup = { resolve, reject };
			x.socket.write(request);
		});
		if (reply[0] !== 1) {
			x.close();
			throw new Error(`the X server refused the connection: ${reply.toString('latin1', 8, 8 + (reply[0] === 0 ? reply[1] : reply.length)).trim()}`);
		}
		x.max_request = reply.readUInt16LE(26) * 4;
		x.root = reply.readUInt32LE(40 + pad(reply.readUInt16LE(24)) + 8 * reply[29]);
		return x;
	}

	async atom(name: string): Promise<number> {
		const length = Buffer.byteLength(name);
		const request = Buffer.alloc(8 + pad(length));
		request[0] = 16;
		request.writeUInt16LE(request.length / 4, 2);
		request.writeUInt16LE(length, 4);
		request.write(name, 8, 'latin1');
		const reply = await this.request(request);
		return reply[0] === 1 ? reply.readUInt32LE(8) : 0;
	}

	async children(window: number): Promise<number[]> {
		const request = Buffer.alloc(8);
		request[0] = 15;
		request.writeUInt16LE(2, 2);
		request.writeUInt32LE(window, 4);
		const reply = await this.request(request);
		if (reply[0] !== 1) return [];
		return Array.from({ length: reply.readUInt16LE(16) }, (_, i) => reply.readUInt32LE(32 + 4 * i));
	}

	/** `type` 0 is any; `length` counts 4-byte units. */
	async property(window: number, property: number, type = 0, length = 1): Promise<Property | null> {
		const request = Buffer.alloc(24);
		request[0] = 20;
		request.writeUInt16LE(6, 2);
		request.writeUInt32LE(window, 4);
		request.writeUInt32LE(property, 8);
		request.writeUInt32LE(type, 12);
		request.writeUInt32LE(length, 20);
		const reply = await this.request(request);
		if (reply[0] !== 1 || reply[1] === 0) return null;
		return { type: reply.readUInt32LE(8), format: reply[1], data: reply.subarray(32, 32 + reply.readUInt32LE(16) * (reply[1] / 8)) };
	}

	/** Down three levels from the root, which reaches a client window inside a reparenting window manager's frame. */
	async windows_of(pid_atom: number, pid: number): Promise<number[]> {
		const found: number[] = [];
		let level = [this.root];
		for (let depth = 0; depth < 3 && level.length > 0; depth++) {
			const children = (await Promise.all(level.map((window) => this.children(window)))).flat();
			const owners = await Promise.all(children.map((window) => this.property(window, pid_atom, CARDINAL)));
			level = children.filter((window, i) => {
				const mine = owners[i]?.data.length === 4 && owners[i]?.data.readUInt32LE(0) === pid;
				if (mine) found.push(window);
				return !mine;
			});
		}
		return found;
	}

	/** Format 32, split so no request outgrows the server's limit, which would otherwise take the BIG-REQUESTS extension. */
	change_property(window: number, property: number, type: number, data: Buffer) {
		const most = (this.max_request - 24) & ~3;
		for (let at = 0; at === 0 || at < data.length; at += most) {
			const part = data.subarray(at, at + most);
			const request = Buffer.alloc(24 + part.length);
			request[0] = 18;
			request[1] = at === 0 ? 0 : 2;
			request.writeUInt16LE(request.length / 4, 2);
			request.writeUInt32LE(window, 4);
			request.writeUInt32LE(property, 8);
			request.writeUInt32LE(type, 12);
			request[16] = 32;
			request.writeUInt32LE(part.length / 4, 20);
			part.copy(request, 24);
			this.send(request);
		}
	}

	/** GetInputFocus, the cheapest round trip: its reply comes after everything sent before it has been handled. */
	async sync(): Promise<void> {
		const request = Buffer.alloc(4);
		request[0] = 43;
		request.writeUInt16LE(1, 2);
		await this.request(request);
	}

	close() {
		this.socket.destroy();
	}

	private send(request: Buffer): number {
		this.socket.write(request);
		return (this.sequence = (this.sequence + 1) & 0xffff);
	}

	private request(request: Buffer): Promise<Buffer> {
		return new Promise((resolve, reject) => this.waiting.set(this.send(request), { resolve, reject }));
	}

	private read() {
		for (;;) {
			if (this.setup) {
				if (this.input.length < 8) return;
				const length = 8 + 4 * this.input.readUInt16LE(6);
				if (this.input.length < length) return;
				const setup = this.setup;
				this.setup = null;
				setup.resolve(this.take(length));
				continue;
			}
			if (this.input.length < 32) return;
			// Replies and generic events carry a length beyond the fixed 32 bytes; errors and core events do not.
			const length = this.input[0] === 1 || (this.input[0] & 0x7f) === 35 ? 32 + 4 * this.input.readUInt32LE(4) : 32;
			if (this.input.length < length) return;
			const packet = this.take(length);
			if (packet[0] > 1) continue;
			const sequence = packet.readUInt16LE(2);
			const waiter = this.waiting.get(sequence);
			this.waiting.delete(sequence);
			if (waiter) waiter.resolve(packet);
			else if (packet[0] === 0) this.refused ??= packet[1];
		}
	}

	private take(length: number): Buffer {
		const packet = this.input.subarray(0, length);
		this.input = this.input.subarray(length);
		return packet;
	}
}
