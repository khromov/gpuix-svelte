// Apple's wallpapers may not be republished, so the share cards' library is rebuilt per machine (macOS only) and gitignored;
// `--use <slug>` turns one into the tracked homepage/assets/wall/wall-mac-<slug>.webp a card can reference.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG = 'https://mesu.apple.com/assets/macos/com_apple_MobileAsset_DesktopPicture/com_apple_MobileAsset_DesktopPicture.xml';
const DESKTOP_PICTURES = '/System/Library/Desktop Pictures';
const ON_DISK: [string, string][] = [
	['Tahoe Dark', '/System/Library/ExtensionKit/Extensions/NeptuneOneWallpaper.appex/Contents/Resources/TahoeDark.heic'],
	['Tahoe Light', '/System/Library/ExtensionKit/Extensions/NeptuneOneWallpaper.appex/Contents/Resources/TahoeLight.heic'],
	['Sonoma Horizon', `${DESKTOP_PICTURES}/.wallpapers/Sonoma Horizon/Sonoma Horizon.heic`],
	['Default Aerial', '/System/Library/Wallpapers/.default/DefaultAerial.heic']
];
const [WIDTH, HEIGHT] = [1600, 1000];

const root = fileURLToPath(new URL('..', import.meta.url));
const originals = join(root, 'wallpapers');
const library = join(root, 'homepage/assets/wall/library');

interface Asset {
	DesktopPictureID: string;
	__BaseURL: string;
	__RelativePath: string;
	_DownloadSize: number;
	_Measurement: string;
}

// plutil can't turn the catalog into JSON because of its <data> checksums, and every asset is a flat dict.
function parse_catalog(xml: string): Asset[] {
	const assets = xml.slice(xml.indexOf('<key>Assets</key>')).match(/<dict>[\s\S]*?<\/dict>/g) ?? [];
	return assets.map((dict) => {
		const asset: Record<string, string | number> = {};
		for (const [, key, type, value] of dict.matchAll(/<key>([^<]+)<\/key>\s*<(string|integer|data)>([\s\S]*?)<\/\2>/g)) {
			asset[key] = type === 'integer' ? Number(value) : type === 'data' ? value.replace(/\s/g, '') : value.replaceAll('&amp;', '&');
		}
		return asset as unknown as Asset;
	});
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const scratch = () => mkdtempSync(join(tmpdir(), 'gpuix-wallpaper-'));
const sips = (...args: string[]) => execFileSync('sips', args, { encoding: 'utf8' });

async function download(asset: Asset) {
	const target = join(originals, `${asset.DesktopPictureID}.heic`);
	if (existsSync(target)) return;
	const response = await fetch(asset.__BaseURL + asset.__RelativePath);
	if (!response.ok) throw new Error(`${asset.DesktopPictureID}: HTTP ${response.status}`);
	const zip = Buffer.from(await response.arrayBuffer());
	if (createHash('sha1').update(zip).digest('base64') !== asset._Measurement) throw new Error(`${asset.DesktopPictureID}: checksum mismatch`);
	const [download_dir, extract_dir] = [scratch(), scratch()];
	try {
		writeFileSync(join(download_dir, 'asset.zip'), zip);
		execFileSync('ditto', ['-x', '-k', join(download_dir, 'asset.zip'), extract_dir]);
		const images = (readdirSync(extract_dir, { recursive: true }) as string[]).filter((f) => /\.heic$/i.test(f));
		if (!images.length) throw new Error(`${asset.DesktopPictureID}: no .heic in the asset`);
		const image = images.map((f) => join(extract_dir, f)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
		renameSync(image, target);
		console.log(`[wallpapers] ${asset.DesktopPictureID} (${(asset._DownloadSize / 1e6).toFixed(1)} MB)`);
	} finally {
		rmSync(download_dir, { recursive: true, force: true });
		rmSync(extract_dir, { recursive: true, force: true });
	}
}

// Scaled to cover WIDTH×HEIGHT, then centre-cropped, as `background-size: cover` would show it.
function fit(source: string, out: string, format: 'jpeg' | 'png') {
	const size = sips('-g', 'pixelWidth', '-g', 'pixelHeight', source);
	const [width, height] = ['pixelWidth', 'pixelHeight'].map((key) => Number(size.match(new RegExp(`${key}: (\\d+)`))![1]));
	const scale = Math.max(WIDTH / width, HEIGHT / height);
	sips('-s', 'format', format, '-s', 'formatOptions', '82', '--resampleHeightWidth', String(Math.ceil(height * scale)), String(Math.ceil(width * scale)), source, '--out', out);
	sips('--cropToHeightWidth', String(HEIGHT), String(WIDTH), out);
}

function use(name: string) {
	const source = readdirSync(originals).find((f) => slug(basename(f, extname(f))) === name);
	if (!source) throw new Error(`[wallpapers] no wallpaper "${name}"; run \`npm run wallpapers\` and pick a slug from homepage/assets/wall/library/index.json`);
	const dir = scratch();
	const out = join(root, `homepage/assets/wall/wall-mac-${name}.webp`);
	try {
		fit(join(originals, source), join(dir, 'wall.png'), 'png');
		execFileSync('cwebp', ['-quiet', '-q', '80', join(dir, 'wall.png'), '-o', out]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	console.log(`[wallpapers] ${out}`);
}

async function build() {
	mkdirSync(originals, { recursive: true });
	mkdirSync(library, { recursive: true });
	const response = await fetch(CATALOG);
	if (!response.ok) throw new Error(`[wallpapers] catalog: HTTP ${response.status}`);
	const assets = parse_catalog(await response.text()).filter((a) => a.DesktopPictureID && a.__RelativePath);
	const queue = [...new Map(assets.map((a) => [a.DesktopPictureID, a])).values()];
	console.log(`[wallpapers] ${queue.length} in Apple's catalog`);
	await Promise.all(Array.from({ length: 4 }, async () => {
		for (let asset = queue.shift(); asset; asset = queue.shift()) await download(asset);
	}));

	const on_disk = readdirSync(DESKTOP_PICTURES).filter((f) => /\.heic$/i.test(f)).map((f): [string, string] => [basename(f, extname(f)), join(DESKTOP_PICTURES, f)]);
	for (const [name, path] of [...ON_DISK, ...on_disk]) {
		const target = join(originals, `${name}${extname(path)}`);
		if (existsSync(path) && !existsSync(target)) copyFileSync(path, target);
	}

	const index = [];
	for (const file of readdirSync(originals).filter((f) => /\.(heic|jpg)$/i.test(f)).sort()) {
		const name = basename(file, extname(file));
		const preview = `${slug(name)}.jpg`;
		if (!existsSync(join(library, preview))) fit(join(originals, file), join(library, preview), 'jpeg');
		index.push({ name, slug: slug(name), file: preview });
	}
	writeFileSync(join(library, 'index.json'), JSON.stringify(index, null, '\t') + '\n');
	console.log(`[wallpapers] ${index.length} wallpapers: originals in ${originals}, previews in ${library}`);
}

if (process.platform !== 'darwin') throw new Error('[wallpapers] macOS only: it reads the wallpapers macOS ships and converts them with sips');
const at = process.argv.indexOf('--use');
if (at > -1) use(process.argv[at + 1] ?? '');
else await build();
