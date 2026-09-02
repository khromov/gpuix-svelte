/**
 * Pours the Hacker News front page into Substrate: every story with an external
 * URL becomes a link item, scraped and embedded through the normal pipeline. Doubles
 * as a scrape smoke test across whatever sites are on the front page today.
 *
 *   bun examples/second-brain/scripts/import-hn.js [count]
 */

if (!process.versions.bun) {
	console.error('[import-hn] needs Bun');
	process.exit(1);
}

const count = Number(process.argv[2]) || 30;
const API = 'https://hacker-news.firebaseio.com/v0';

const { create_app } = await import('../lib/app.js');
const app = await create_app();

const ids = await (await fetch(`${API}/topstories.json`)).json();
const stories = (await Promise.all(ids.slice(0, count).map(async (id) => (await fetch(`${API}/item/${id}.json`)).json()))).filter(
	(s) => s?.url
);
console.log(`[import-hn] ${stories.length} stories with links`);

const started = performance.now();
const added = [];
for (const story of stories) {
	try {
		const { item, existed } = await app.add_link(story.url);
		added.push({ story, item, existed });
		console.log(`  ${existed ? 'have' : 'new '} ${item.id}  ${story.title}`);
	} catch (err) {
		console.log(`  skip     ${story.url}: ${err.message}`);
	}
}

await app.ingest.idle();
console.log(`\n[import-hn] pipeline idle after ${((performance.now() - started) / 1000).toFixed(0)}s\n`);

let ok = 0;
for (const { story, item } of added) {
	const fresh = app.get_item(item.id);
	if (!fresh) continue;
	const site = fresh.meta.site_name ?? new URL(story.url).hostname;
	if (fresh.status === 'ready') {
		ok++;
		console.log(`  ok    ${String(fresh.id).padStart(3)}  ${site.padEnd(28)} ${fresh.body.length.toString().padStart(6)} chars  thumb=${fresh.thumb_path ? 'y' : '-'}  ${JSON.stringify(fresh.title).slice(0, 60)}`);
	} else {
		console.log(`  ${fresh.status.padEnd(5)} ${String(fresh.id).padStart(3)}  ${site.padEnd(28)} ${fresh.error}`);
	}
}
const counts = app.snapshot().counts;
console.log(`\n[import-hn] ${ok}/${added.length} links ready · brain now holds ${counts.total} items, ${app.vectors.size} vectors`);
app.close();
process.exit(0);
