// Runs every .svelte / .svelte.ts file past the official Svelte MCP server's autofixer
// (the endpoint .mcp.json already points at) and prints what came back. a11y warnings are
// hidden unless --a11y for the reason svelte.config.js filters them: there is no DOM here.
// The transport is ~60 lines of fetch, so the repo keeps its three dependencies.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTOCOL = '2025-06-18';
const SKIP = new Set(['node_modules', 'dist', 'vendor', 'starter']);

const HELP = `usage: npm run check:svelte -- [options] [file|dir ...]

Checks every .svelte and .svelte.ts file (or just the ones given) with the
svelte-autofixer tool on the Svelte MCP server.

  --a11y        include the a11y warnings hidden by default
  --json        emit the raw report as JSON instead of text
  --jobs <n>    files in flight at once (default 6)
  --url <url>   MCP endpoint (default: .mcp.json's svelte server)
  -h, --help    this`;

type Finding = { kind: 'issue' | 'suggestion' | 'error'; message: string; code?: string; line?: number; column?: number };
type Report = { file: string; findings: Finding[]; hidden: number };
type ToolResult = { content?: { type: string; text?: string }[]; structuredContent?: { issues?: string[]; suggestions?: string[] }; isError?: boolean };

const root = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
const paths: string[] = [];
let show_a11y = false;
let as_json = false;
let jobs = 6;
let url = '';

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === '--a11y') show_a11y = true;
	else if (arg === '--json') as_json = true;
	else if (arg === '--jobs') jobs = Math.max(1, Number(args[++i]));
	else if (arg === '--url') url = args[++i];
	else if (arg === '-h' || arg === '--help') die(HELP, 0);
	else if (arg.startsWith('-')) die(`unknown flag ${arg}\n\n${HELP}`, 2);
	else paths.push(arg);
}

if (!Number.isFinite(jobs)) die('--jobs wants a number', 2);
url ||= configured_url();

const files = (paths.length ? paths.flatMap(expand) : walk(root)).sort();
if (!files.length) die('no .svelte or .svelte.ts files found', 2);

const tty = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint('1');
const dim = paint('2');
const red = paint('31');
const yellow = paint('33');
const green = paint('32');

const progress = tty && !as_json;
let done = 0;

if (!as_json) {
	console.log(`${bold('svelte-mcp')} ${dim(`· ${files.length} files · ${url}`)}`);
	if (!show_a11y) {
		console.log(dim('excluding a11y warnings: GPUI has no DOM and no accessibility tree, so they never apply here. --a11y shows them.'));
	}
}

const client = create_client(url);
const reports = await map_pool(files, jobs, async (file) => {
	const report = await check(file);
	done++;
	if (progress) process.stderr.write(`\r${dim(`checking ${done}/${files.length}`)}\x1b[K`);
	return report;
});
if (progress) process.stderr.write('\r\x1b[K');
await client.close();

if (as_json) {
	console.log(JSON.stringify({ url, files: files.length, reports: reports.filter((r) => r.findings.length) }, null, '\t'));
} else {
	print(reports);
}

process.exit(reports.some((r) => r.findings.some((f) => f.kind !== 'suggestion')) ? 1 : 0);

async function check(file: string): Promise<Report> {
	const relative_path = display(file);
	try {
		const result = await client.call<ToolResult>('tools/call', {
			name: 'svelte-autofixer',
			arguments: { code: readFileSync(file, 'utf8'), filename: basename(file), desired_svelte_version: 5 }
		});
		const text = result.content?.find((c) => c.type === 'text')?.text;
		const payload = result.structuredContent ?? (text ? JSON.parse(text) : {});
		if (result.isError) throw new Error(text ?? 'the tool reported an error');

		const findings: Finding[] = [];
		let hidden = 0;
		for (const issue of payload.issues ?? []) {
			const finding = parse_finding('issue', issue);
			if (!show_a11y && finding.code?.startsWith('a11y_')) hidden++;
			else findings.push(finding);
		}
		for (const suggestion of unique(payload.suggestions ?? [])) {
			findings.push(parse_finding('suggestion', suggestion));
		}
		return { file: relative_path, findings, hidden };
	} catch (error) {
		return { file: relative_path, findings: [{ kind: 'error', message: collapse(String(error)) }], hidden: 0 };
	}
}

// "message\nhttps://svelte.dev/e/<code> at line 3, column 1" — the tail and the doc link are
// the only structure the server gives back, everything else is prose.
function parse_finding(kind: 'issue' | 'suggestion', text: string): Finding {
	const at = /^([\s\S]*?)\s*at line (\d+), column (\d+)\s*$/.exec(text);
	const head = at ? at[1] : text;
	const link = /https:\/\/svelte\.dev\/e\/([\w-]+)/.exec(head);
	return {
		kind,
		message: collapse(link ? head.replace(link[0], '') : head),
		code: link?.[1],
		line: at ? Number(at[2]) : undefined,
		column: at ? Number(at[3]) : undefined
	};
}

function print(reports: Report[]) {
	let issues = 0;
	let suggestions = 0;
	let errors = 0;
	let hidden = 0;

	for (const report of reports) {
		hidden += report.hidden;
		if (!report.findings.length) continue;
		console.log(`\n${bold(report.file)}`);
		for (const finding of report.findings) {
			if (finding.kind === 'issue') issues++;
			else if (finding.kind === 'suggestion') suggestions++;
			else errors++;
			const label = finding.kind.padEnd(10);
			const where = (finding.line ? `line ${finding.line}` : '').padEnd(8);
			const code = finding.code ? dim(` (${finding.code})`) : '';
			console.log(`  ${finding.kind === 'suggestion' ? yellow(label) : red(label)}  ${dim(where)}  ${finding.message}${code}`);
		}
	}

	const counted = reports.filter((r) => r.findings.some((f) => f.kind === 'issue')).length;
	const parts = [
		plural(files.length, 'file'),
		issues ? `${plural(issues, 'issue')} in ${plural(counted, 'file')}` : green('no issues'),
		plural(suggestions, 'suggestion')
	];
	if (errors) parts.push(red(`${plural(errors, 'file')} failed`));
	if (hidden) parts.push(dim(`${hidden} a11y hidden (--a11y)`));
	console.log(`\n${parts.join(dim(' · '))}`);
}

// Streamable HTTP: one POST per call, answered either as JSON or as a one-message SSE stream.
function create_client(endpoint: string) {
	let session: string | undefined;
	let handshake: Promise<void> | undefined;
	let next_id = 0;

	async function post(body: unknown) {
		const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
		if (session) {
			headers['mcp-session-id'] = session;
			headers['mcp-protocol-version'] = PROTOCOL;
		}
		return fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
	}

	async function send(method: string, params: unknown, id?: number) {
		const res = await post(id === undefined ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params });
		if (!res.ok) throw Object.assign(new Error(`${method} -> ${res.status} ${res.statusText}`), { status: res.status });
		if (id === undefined) return undefined;
		const message = read_message(await res.text(), res.headers.get('content-type') ?? '');
		if (message.error) throw new Error(`${method} -> ${message.error.message}`);
		return message.result;
	}

	async function connect() {
		const res = await post({
			jsonrpc: '2.0',
			id: ++next_id,
			method: 'initialize',
			params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'gpuix-svelte-check', version: '1' } }
		});
		if (!res.ok) throw new Error(`initialize -> ${res.status} ${res.statusText}`);
		session = res.headers.get('mcp-session-id') ?? undefined;
		await res.text();
		await send('notifications/initialized', undefined);
	}

	return {
		async call<T>(method: string, params: unknown): Promise<T> {
			for (let attempt = 0; ; attempt++) {
				handshake ??= connect();
				await handshake;
				try {
					return (await send(method, params, ++next_id)) as T;
				} catch (error) {
					const status = (error as { status?: number }).status ?? 0;
					const retryable = status === 404 || status === 429 || status >= 500;
					if (!retryable || attempt >= 3) throw error;
					if (status === 404) handshake = undefined;
					await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
				}
			}
		},
		async close() {
			if (!session) return;
			await fetch(endpoint, { method: 'DELETE', headers: { 'mcp-session-id': session, 'mcp-protocol-version': PROTOCOL } }).catch(() => {});
		}
	};
}

function read_message(body: string, content_type: string) {
	let json = body;
	if (content_type.includes('text/event-stream')) {
		const data = body
			.split(/\r?\n/)
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).trim());
		if (!data.length) throw new Error('the server sent an event stream with no data');
		json = data.join('\n');
	}
	return JSON.parse(json) as { result?: unknown; error?: { message: string } };
}

async function map_pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (cursor < items.length) {
				const index = cursor++;
				out[index] = await run(items[index]);
			}
		})
	);
	return out;
}

function walk(dir: string, out: string[] = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (is_svelte(entry.name)) out.push(full);
	}
	return out;
}

function expand(path: string) {
	const full = resolve(path);
	if (statSync(full).isDirectory()) return walk(full);
	if (!is_svelte(full)) die(`${path} is not a .svelte or .svelte.ts file`, 2);
	return [full];
}

function configured_url() {
	try {
		const config = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')) as { mcpServers?: Record<string, { url?: string }> };
		if (config.mcpServers?.svelte?.url) return config.mcpServers.svelte.url;
	} catch {
		// no .mcp.json, or it has no svelte server — the public endpoint is the same either way
	}
	return 'https://mcp.svelte.dev/mcp';
}

// A path outside the cwd relativizes to a wall of ../, which no terminal will linkify.
function display(file: string) {
	const path = relative(process.cwd(), file);
	return path.startsWith('..') ? file : path;
}

function is_svelte(name: string) {
	return name.endsWith('.svelte') || name.endsWith('.svelte.ts');
}

function unique(values: string[]) {
	return [...new Set(values)];
}

function plural(count: number, noun: string) {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function collapse(text: string) {
	return text.replace(/\s+/g, ' ').trim();
}

function die(message: string, code: number): never {
	console[code ? 'error' : 'log'](message);
	process.exit(code);
}
